/**
 * PrepAIred Beta Worker — v1.0.0
 *
 * Serves the free tier via rotating house Groq keys.
 * No auth, no credits — just works, with rate limiting per IP.
 *
 * Routes:
 *   GET  /health          health check
 *   POST /api/free        free tier proxy — picks a house Groq key, round-robins
 *
 * Environment secrets (set via wrangler secret):
 *   HOUSE_GROQ_KEY_1      gsk_...  (required — at least one)
 *   HOUSE_GROQ_KEY_2      gsk_...  (optional — for rotation headroom)
 *   HOUSE_GROQ_KEY_3      gsk_...  (optional)
 *   ...up to HOUSE_GROQ_KEY_10
 *   ALLOWED_ORIGIN        https://ijnebzor.github.io  (lock down after deploy)
 *
 * KV namespace: BETA_RATE  (for per-IP rate limiting)
 *   rate:{ip}  → { count, windowStart }   TTL: 1 hour
 *
 * Rate limit: 3 free sessions per IP per hour.
 * Each session = up to 30 API calls (10 questions × 3 turns).
 * Groq free tier is ~14,400 req/day per key. With 3 keys that's ~43,200/day.
 * At 30 calls/session that's ~1,440 full free sessions/day before hitting limits.
 */

const CORS_HEADERS = (origin) => ({
  'Access-Control-Allow-Origin': origin || '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
});

const FREE_MODEL       = 'llama-3.1-8b-instant';  // Groq free tier
const MAX_TOKENS       = 900;
const RATE_LIMIT_MAX   = 30;   // API calls per IP per hour (covers ~1 full session)
const RATE_WINDOW_MS   = 60 * 60 * 1000; // 1 hour

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = env.ALLOWED_ORIGIN || '*';

    // Validate origin in production
    if (allowed !== '*' && origin !== allowed) {
      return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const cors = CORS_HEADERS(allowed === '*' ? '*' : origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }

    const url = new URL(request.url);

    if (url.pathname === '/health') {
      const keyCount = countHouseKeys(env);
      return json({ status: 'ok', version: '1.0.0', houseKeys: keyCount }, 200, cors);
    }

    if (url.pathname === '/api/free' && request.method === 'POST') {
      return handleFree(request, env, cors);
    }

    return json({ error: 'Not found' }, 404, cors);
  }
};

// ── FREE TIER PROXY ───────────────────────────────────────────────────────────
async function handleFree(request, env, cors) {
  // Per-IP rate limiting
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const rateLimited = await checkRateLimit(ip, env);
  if (rateLimited) {
    return json({
      error: 'Free tier rate limit reached.',
      hint: 'You have used all free requests for this hour. Purchase credits for uninterrupted access.',
      retryAfter: rateLimited
    }, 429, cors);
  }

  // Pick a house key (round-robin by request counter stored in KV)
  const key = await pickHouseKey(env);
  if (!key) {
    return json({ error: 'No house keys configured. Contact support.' }, 503, cors);
  }

  // Parse request body
  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'Invalid JSON body' }, 400, cors); }

  const system   = body.system   || '';
  const messages = body.messages || [];

  if (!messages.length) {
    return json({ error: 'messages array required' }, 400, cors);
  }

  // Build Groq-compatible request
  const groqBody = {
    model: FREE_MODEL,
    max_tokens: MAX_TOKENS,
    messages: [
      { role: 'system', content: system },
      ...messages
    ],
  };

  // Call Groq
  let groqResp;
  try {
    groqResp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify(groqBody),
    });
  } catch (e) {
    return json({ error: 'Groq unreachable: ' + e.message }, 502, cors);
  }

  const groqData = await groqResp.json();

  if (!groqResp.ok || groqData.error) {
    // If rate limited by Groq itself, try the next key once
    if (groqResp.status === 429) {
      const fallback = await pickHouseKey(env, true); // skip current key
      if (fallback && fallback !== key) {
        const retry = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${fallback}` },
          body: JSON.stringify(groqBody),
        });
        const retryData = await retry.json();
        if (retry.ok && !retryData.error) {
          return normaliseAndReturn(retryData, cors);
        }
      }
      return json({
        error: 'Free tier is under high load right now. Please try again in a moment, or upgrade to Credits for guaranteed access.',
        retryable: true
      }, 429, cors);
    }
    return json({ error: groqData.error?.message || 'Upstream error', status: groqResp.status }, groqResp.status, cors);
  }

  // Increment rate limit counter
  await incrementRateLimit(ip, env);

  return normaliseAndReturn(groqData, cors);
}

// Normalise Groq response to the shape the frontend expects
// Frontend uses prov.extract(data) which for groq reads choices[0].message.content
function normaliseAndReturn(groqData, cors) {
  return new Response(JSON.stringify(groqData), {
    status: 200,
    headers: { ...cors, 'Content-Type': 'application/json', 'X-Model': FREE_MODEL },
  });
}

// ── HOUSE KEY ROTATION ────────────────────────────────────────────────────────
function countHouseKeys(env) {
  let count = 0;
  for (let i = 1; i <= 10; i++) {
    if (env[`HOUSE_GROQ_KEY_${i}`]) count++;
  }
  return count;
}

function getHouseKeys(env) {
  const keys = [];
  for (let i = 1; i <= 10; i++) {
    const k = env[`HOUSE_GROQ_KEY_${i}`];
    if (k) keys.push(k);
  }
  return keys;
}

async function pickHouseKey(env, skipFirst = false) {
  const keys = getHouseKeys(env);
  if (!keys.length) return null;
  if (keys.length === 1) return skipFirst ? null : keys[0];

  // Use a simple atomic counter in KV if available, else random
  if (env.BETA_RATE) {
    try {
      const raw = await env.BETA_RATE.get('_key_counter');
      let counter = raw ? parseInt(raw) : 0;
      if (skipFirst) counter++;
      const idx = counter % keys.length;
      await env.BETA_RATE.put('_key_counter', String(counter + 1), { expirationTtl: 86400 });
      return keys[idx];
    } catch {
      // KV unavailable — fall through to random
    }
  }
  const offset = skipFirst ? 1 : 0;
  return keys[(Math.floor(Math.random() * keys.length) + offset) % keys.length];
}

// ── RATE LIMITING ─────────────────────────────────────────────────────────────
async function checkRateLimit(ip, env) {
  if (!env.BETA_RATE) return false; // no KV = no rate limiting (dev mode)
  try {
    const raw = await env.BETA_RATE.get(`rate:${ip}`);
    if (!raw) return false;
    const record = JSON.parse(raw);
    const now = Date.now();
    if (now - record.windowStart > RATE_WINDOW_MS) return false; // window expired
    if (record.count >= RATE_LIMIT_MAX) {
      const resetMs = record.windowStart + RATE_WINDOW_MS - now;
      return Math.ceil(resetMs / 60000); // minutes until reset
    }
    return false;
  } catch { return false; }
}

async function incrementRateLimit(ip, env) {
  if (!env.BETA_RATE) return;
  try {
    const key = `rate:${ip}`;
    const raw = await env.BETA_RATE.get(key);
    const now = Date.now();
    let record = raw ? JSON.parse(raw) : null;
    if (!record || now - record.windowStart > RATE_WINDOW_MS) {
      record = { count: 1, windowStart: now };
    } else {
      record.count++;
    }
    await env.BETA_RATE.put(key, JSON.stringify(record), { expirationTtl: 3600 });
  } catch {}
}

// ── UTILS ─────────────────────────────────────────────────────────────────────
function json(data, status, cors) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
