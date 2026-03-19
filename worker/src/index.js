/**
 * PrepAIred API Worker — v1.0.0
 * Cloudflare Worker that:
 *  1. Handles Whop webhook → stores credits in KV
 *  2. Issues session tokens for verified purchasers
 *  3. Proxies Anthropic API calls, validating + decrementing credits
 *
 * KV namespace: CREDITS
 *   credits:{email}        → { credits: number, plan: string, created: iso }
 *   session:{token}        → { email: string, expires: timestamp }
 *
 * Environment secrets (set via wrangler secret or dashboard):
 *   ANTHROPIC_API_KEY      — your Anthropic key (pool key for paid users)
 *   WHOP_WEBHOOK_SECRET    — from Whop dashboard → Developer → Webhooks
 *   SESSION_SECRET         — random 32-char string for HMAC token signing
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Session-Token',
};

// Credits per plan — adjust to match your Whop products
const PLAN_CREDITS = {
  'single':  1,   // $2
  'five':    5,   // $5
  'fifteen': 15,  // $10
};

// Cost per API call in credits
const CREDITS_PER_CALL = 1;

// Anthropic model used for paid tier
const PAID_MODEL = 'claude-haiku-4-5-20251001';

export default {
  async fetch(request, env, ctx) {
    // Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    const url = new URL(request.url);

    // ── ROUTES ───────────────────────────────────────────────────────────────
    if (url.pathname === '/webhook/whop' && request.method === 'POST') {
      return handleWhopWebhook(request, env);
    }
    if (url.pathname === '/auth/verify' && request.method === 'POST') {
      return handleVerify(request, env);
    }
    if (url.pathname === '/credits/check' && request.method === 'GET') {
      return handleCreditsCheck(request, env);
    }
    if (url.pathname === '/api/chat' && request.method === 'POST') {
      return handleChatProxy(request, env);
    }
    if (url.pathname === '/health') {
      return json({ status: 'ok', version: '1.0.0' });
    }

    return json({ error: 'Not found' }, 404);
  }
};

// ── WHOP WEBHOOK ─────────────────────────────────────────────────────────────
// Fired when a user completes a purchase on Whop
async function handleWhopWebhook(request, env) {
  // Verify Whop signature
  const sig = request.headers.get('X-Whop-Signature');
  const body = await request.text();

  if (!await verifyWhopSignature(body, sig, env.WHOP_WEBHOOK_SECRET)) {
    return json({ error: 'Invalid signature' }, 401);
  }

  let event;
  try { event = JSON.parse(body); } catch { return json({ error: 'Invalid JSON' }, 400); }

  // We only care about completed purchases
  // Whop event types: payment.succeeded, membership.created, membership.renewed
  if (!['payment.succeeded', 'membership.created'].includes(event.event)) {
    return json({ ok: true, skipped: true });
  }

  const data = event.data;
  const email = data?.user?.email || data?.email;
  const planId = data?.product?.id || data?.plan_id || 'single';

  if (!email) return json({ error: 'No email in webhook payload' }, 400);

  // Map Whop product ID → credit amount
  // You'll update these IDs once you create products in Whop
  const credits = resolveCredits(planId, data?.quantity || 1);

  // Load existing credits
  const key = `credits:${email.toLowerCase()}`;
  const existing = await getKV(env.CREDITS, key);
  const current = existing ? existing.credits : 0;

  const record = {
    credits: current + credits,
    email: email.toLowerCase(),
    plan: planId,
    lastPurchase: new Date().toISOString(),
    totalPurchased: (existing?.totalPurchased || 0) + credits,
  };

  await env.CREDITS.put(key, JSON.stringify(record), {
    // Keep records for 1 year after last write
    expirationTtl: 60 * 60 * 24 * 365,
  });

  console.log(`Credits granted: ${email} +${credits} (total: ${record.credits})`);
  return json({ ok: true, email, creditsAdded: credits, totalCredits: record.credits });
}

function resolveCredits(planId, qty) {
  // Match by plan name substring (case-insensitive)
  // Update these to match your actual Whop product IDs/names
  const id = String(planId).toLowerCase();
  if (id.includes('fifteen') || id.includes('15')) return 15 * qty;
  if (id.includes('five') || id.includes('5pack')) return 5 * qty;
  return 1 * qty; // Default: single interview
}

async function verifyWhopSignature(body, signature, secret) {
  if (!signature || !secret) return false;
  try {
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    );
    const sigBytes = hexToBytes(signature.replace('sha256=', ''));
    const bodyBytes = new TextEncoder().encode(body);
    return await crypto.subtle.verify('HMAC', key, sigBytes, bodyBytes);
  } catch { return false; }
}

// ── AUTH: EMAIL VERIFICATION ──────────────────────────────────────────────────
// User submits their email → we check they have credits → issue session token
async function handleVerify(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const email = (body.email || '').toLowerCase().trim();
  if (!email || !email.includes('@')) return json({ error: 'Valid email required' }, 400);

  const key = `credits:${email}`;
  const record = await getKV(env.CREDITS, key);

  if (!record || record.credits <= 0) {
    return json({
      error: 'No credits found for this email.',
      hint: 'Purchase a credit pack at prepaired.ijneb.dev to get started.'
    }, 403);
  }

  // Issue session token (JWT-lite: base64(payload).signature)
  const token = await issueToken(email, env.SESSION_SECRET);
  const sessionKey = `session:${token}`;
  await env.CREDITS.put(sessionKey, JSON.stringify({ email, issued: new Date().toISOString() }), {
    expirationTtl: 60 * 60 * 24, // 24h session
  });

  return json({
    ok: true,
    token,
    credits: record.credits,
    email,
  });
}

// ── CREDITS CHECK ─────────────────────────────────────────────────────────────
async function handleCreditsCheck(request, env) {
  const token = request.headers.get('X-Session-Token');
  const session = await validateToken(token, env);
  if (!session) return json({ error: 'Invalid or expired session' }, 401);

  const record = await getKV(env.CREDITS, `credits:${session.email}`);
  return json({
    email: session.email,
    credits: record?.credits || 0,
  });
}

// ── CHAT PROXY ────────────────────────────────────────────────────────────────
// Validates session, decrements credits, proxies to Anthropic
async function handleChatProxy(request, env) {
  const token = request.headers.get('X-Session-Token');
  const session = await validateToken(token, env);
  if (!session) return json({ error: 'Invalid or expired session. Please re-verify your email.' }, 401);

  // Load + check credits
  const creditKey = `credits:${session.email}`;
  const record = await getKV(env.CREDITS, creditKey);
  if (!record || record.credits < CREDITS_PER_CALL) {
    return json({
      error: 'No credits remaining.',
      credits: 0,
      hint: 'Purchase more credits at prepaired.ijneb.dev'
    }, 402);
  }

  // Parse the incoming request body
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid request body' }, 400); }

  // Enforce model — paid users always get PAID_MODEL, no overrides
  body.model = PAID_MODEL;
  // Cap max_tokens for cost control
  body.max_tokens = Math.min(body.max_tokens || 1000, 1200);

  // Forward to Anthropic
  let anthropicResp;
  try {
    anthropicResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return json({ error: 'Upstream API unreachable: ' + e.message }, 502);
  }

  const responseData = await anthropicResp.json();

  // Only decrement on success
  if (anthropicResp.ok && !responseData.error) {
    const updated = {
      ...record,
      credits: record.credits - CREDITS_PER_CALL,
      lastUsed: new Date().toISOString(),
    };
    await env.CREDITS.put(creditKey, JSON.stringify(updated), {
      expirationTtl: 60 * 60 * 24 * 365,
    });

    // Inject credits remaining into response headers (client can read this)
    const headers = {
      ...CORS,
      'Content-Type': 'application/json',
      'X-Credits-Remaining': String(updated.credits),
    };
    return new Response(JSON.stringify(responseData), {
      status: anthropicResp.status,
      headers,
    });
  }

  // Pass through errors from Anthropic
  return new Response(JSON.stringify(responseData), {
    status: anthropicResp.status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// ── TOKEN HELPERS ─────────────────────────────────────────────────────────────
async function issueToken(email, secret) {
  const payload = btoa(JSON.stringify({ email, iat: Date.now() }));
  const sig = await hmacSign(payload, secret);
  return `${payload}.${sig}`;
}

async function validateToken(token, env) {
  if (!token) return null;
  // Check it's in KV (handles expiry automatically)
  const sessionKey = `session:${token}`;
  const session = await getKV(env.CREDITS, sessionKey);
  if (!session) return null;
  return session;
}

async function hmacSign(data, secret) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return bytesToHex(new Uint8Array(sig));
}

// ── KV HELPER ────────────────────────────────────────────────────────────────
async function getKV(ns, key) {
  try {
    const val = await ns.get(key);
    return val ? JSON.parse(val) : null;
  } catch { return null; }
}

// ── UTILS ────────────────────────────────────────────────────────────────────
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  return bytes;
}
function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}
