/**
 * PrepAIred API Worker — v1.1.0
 *
 * Changes from v1.0:
 *  - Email OTP verification (6-digit code, 10-minute expiry)
 *  - /auth/request-otp  → sends OTP to email via Resend
 *  - /auth/verify       → validates OTP, issues session token
 *  - /admin/gift        → bulk-gift credits (requires X-Admin-Secret header)
 *  - /admin/credits     → look up a user's credit balance
 *
 * KV namespace: CREDITS
 *   credits:{email}      → { credits, email, plan, lastPurchase, totalPurchased }
 *   otp:{email}          → { code, expires, attempts, sentAt }   TTL: 10 min
 *   session:{token}      → { email, issued }                     TTL: 24 hr
 *
 * Environment secrets:
 *   ANTHROPIC_API_KEY    pool key for paid sessions
 *   WHOP_WEBHOOK_SECRET  from Whop Dashboard → Developer → Webhooks
 *   SESSION_SECRET       random 32-char hex
 *   RESEND_API_KEY       from resend.com (free: 3k emails/month)
 *   FROM_EMAIL           e.g. prepaired@ijneb.dev (verified in Resend)
 *   ADMIN_SECRET         strong random string for admin endpoints
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Session-Token, X-Admin-Secret',
};

const CREDITS_PER_CALL   = 1;
const PAID_MODEL         = 'claude-haiku-4-5-20251001';
const OTP_EXPIRY_SECONDS = 600;
const OTP_MAX_ATTEMPTS   = 5;
const SESSION_TTL        = 86400;

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(request.url);

    if (url.pathname === '/health')
      return json({ status: 'ok', version: '1.1.0' });
    if (url.pathname === '/webhook/whop' && request.method === 'POST')
      return handleWhopWebhook(request, env);
    if (url.pathname === '/auth/request-otp' && request.method === 'POST')
      return handleRequestOtp(request, env);
    if (url.pathname === '/auth/verify' && request.method === 'POST')
      return handleVerifyOtp(request, env);
    if (url.pathname === '/credits/check' && request.method === 'GET')
      return handleCreditsCheck(request, env);
    if (url.pathname === '/api/chat' && request.method === 'POST')
      return handleChatProxy(request, env);
    if (url.pathname === '/admin/gift' && request.method === 'POST')
      return handleAdminGift(request, env);
    if (url.pathname === '/admin/credits' && request.method === 'GET')
      return handleAdminCreditsLookup(request, env);

    return json({ error: 'Not found' }, 404);
  }
};

// ── OTP: REQUEST ──────────────────────────────────────────────────────────────
async function handleRequestOtp(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const email = norm(body.email);
  if (!email) return json({ error: 'Valid email required' }, 400);

  const record = await getKV(env.CREDITS, `credits:${email}`);
  if (!record || record.credits <= 0)
    return json({ error: 'No credits found for this email.', hint: 'Purchase a credit pack at prepaired.ijneb.dev' }, 403);

  // Rate limit: 30 seconds between OTP requests
  const existing = await getKV(env.CREDITS, `otp:${email}`);
  if (existing && existing.sentAt > Date.now() - 30000)
    return json({ error: 'Code already sent. Wait 30 seconds before requesting another.' }, 429);

  const code = String(Math.floor(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000)));
  await env.CREDITS.put(`otp:${email}`, JSON.stringify({
    code, expires: Date.now() + OTP_EXPIRY_SECONDS * 1000, attempts: 0, sentAt: Date.now()
  }), { expirationTtl: OTP_EXPIRY_SECONDS });

  const sent = await sendOtpEmail(email, code, record.credits, env);
  if (!sent.ok) return json({ error: 'Failed to send email: ' + sent.error }, 502);

  return json({ ok: true, message: `Code sent to ${email}. Valid for 10 minutes.` });
}

// ── OTP: VERIFY ───────────────────────────────────────────────────────────────
async function handleVerifyOtp(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const email = norm(body.email);
  const code = String(body.code || '').trim().replace(/\s/g, '');
  if (!email) return json({ error: 'Valid email required' }, 400);
  if (!code || code.length !== 6) return json({ error: 'Code must be 6 digits' }, 400);

  const otpRecord = await getKV(env.CREDITS, `otp:${email}`);
  if (!otpRecord)         return json({ error: 'No code found. Request a new one.' }, 404);
  if (Date.now() > otpRecord.expires) return json({ error: 'Code expired. Request a new one.' }, 410);
  if (otpRecord.attempts >= OTP_MAX_ATTEMPTS)
    return json({ error: 'Too many failed attempts. Request a new code.' }, 429);

  const match = await timingSafeEqual(code, otpRecord.code);
  if (!match) {
    otpRecord.attempts += 1;
    const ttlLeft = Math.max(1, Math.floor((otpRecord.expires - Date.now()) / 1000));
    await env.CREDITS.put(`otp:${email}`, JSON.stringify(otpRecord), { expirationTtl: ttlLeft });
    const rem = OTP_MAX_ATTEMPTS - otpRecord.attempts;
    return json({ error: `Incorrect code. ${rem} attempt${rem !== 1 ? 's' : ''} remaining.` }, 401);
  }

  await env.CREDITS.delete(`otp:${email}`);
  const creditRecord = await getKV(env.CREDITS, `credits:${email}`);
  if (!creditRecord || creditRecord.credits <= 0)
    return json({ error: 'No credits remaining. Purchase more at prepaired.ijneb.dev' }, 402);

  const token = await issueToken(email, env.SESSION_SECRET);
  await env.CREDITS.put(`session:${token}`, JSON.stringify({ email, issued: new Date().toISOString() }), { expirationTtl: SESSION_TTL });

  return json({ ok: true, token, credits: creditRecord.credits, email });
}

// ── RESEND EMAIL ──────────────────────────────────────────────────────────────
async function sendOtpEmail(email, code, credits, env) {
  const from = env.FROM_EMAIL || 'prepaired@ijneb.dev';
  const fmt = `${code.slice(0,3)} ${code.slice(3)}`;
  const html = `<!DOCTYPE html><html><body style="background:#000;color:#d1d5db;font-family:monospace;padding:40px 20px;max-width:480px;margin:0 auto;"><div style="border:1px solid #222;border-radius:8px;padding:32px;background:#0a0a0a;"><div style="font-size:11px;color:#00e5cc;letter-spacing:0.3em;text-transform:uppercase;margin-bottom:20px;">PrepAIred</div><div style="font-size:24px;font-weight:700;color:#f9fafb;margin-bottom:8px;">Verification code</div><div style="font-size:12px;color:#4b5563;margin-bottom:24px;">Valid for 10 minutes. Do not share this code.</div><div style="background:#000;border:1px solid #00e5cc;border-radius:6px;padding:20px;text-align:center;margin-bottom:24px;"><div style="font-size:36px;font-weight:700;color:#00e5cc;letter-spacing:0.2em;">${fmt}</div></div><div style="font-size:12px;color:#4b5563;border-top:1px solid #1a1a1a;padding-top:20px;">You have <strong style="color:#d1d5db;">${credits} credit${credits!==1?'s':''}</strong> remaining. If you didn't request this, ignore it — your credits are safe.</div></div></body></html>`;
  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: `PrepAIred <${from}>`, to: [email], subject: `${fmt} — your PrepAIred code`, html }),
    });
    const data = await resp.json();
    return resp.ok ? { ok: true } : { ok: false, error: data.message || 'Resend error' };
  } catch (e) { return { ok: false, error: e.message }; }
}

// ── ADMIN: BULK GIFT ──────────────────────────────────────────────────────────
// POST /admin/gift  headers: X-Admin-Secret: YOUR_SECRET
// body: { emails: ["a@b.com", "c@d.com"], credits: 5, note: "beta" }
// or:   { email: "a@b.com", credits: 3, note: "comp" }
async function handleAdminGift(request, env) {
  if (!checkAdmin(request, env)) return json({ error: 'Unauthorized' }, 401);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const credits = parseInt(body.credits);
  if (!credits || credits < 1 || credits > 1000)
    return json({ error: 'credits must be 1–1000' }, 400);

  const emails = (body.emails ? body.emails : body.email ? [body.email] : [])
    .map(norm).filter(Boolean);
  if (!emails.length) return json({ error: 'No valid emails' }, 400);
  if (emails.length > 100) return json({ error: 'Max 100 emails per request' }, 400);

  const note = body.note || 'gift';
  const results = [];
  for (const email of emails) {
    const key = `credits:${email}`;
    const ex = await getKV(env.CREDITS, key);
    const before = ex?.credits || 0;
    const rec = { credits: before + credits, email, plan: note, lastPurchase: new Date().toISOString(), totalPurchased: (ex?.totalPurchased || 0) + credits };
    await env.CREDITS.put(key, JSON.stringify(rec), { expirationTtl: 60*60*24*365 });
    results.push({ email, before, after: rec.credits, added: credits });
  }
  return json({ ok: true, gifted: results.length, results });
}

// ── ADMIN: CREDITS LOOKUP ─────────────────────────────────────────────────────
// GET /admin/credits?email=user@example.com  headers: X-Admin-Secret: YOUR_SECRET
async function handleAdminCreditsLookup(request, env) {
  if (!checkAdmin(request, env)) return json({ error: 'Unauthorized' }, 401);
  const url = new URL(request.url);
  const email = norm(url.searchParams.get('email') || '');
  if (!email) return json({ error: 'email param required' }, 400);
  const record = await getKV(env.CREDITS, `credits:${email}`);
  return json(record ? { ...record, found: true } : { email, credits: 0, found: false });
}

// ── WHOP WEBHOOK ─────────────────────────────────────────────────────────────
async function handleWhopWebhook(request, env) {
  const sig = request.headers.get('X-Whop-Signature');
  const body = await request.text();
  if (!await verifyWhopSig(body, sig, env.WHOP_WEBHOOK_SECRET))
    return json({ error: 'Invalid signature' }, 401);

  let event;
  try { event = JSON.parse(body); } catch { return json({ error: 'Invalid JSON' }, 400); }
  if (!['payment.succeeded','membership.created'].includes(event.event))
    return json({ ok: true, skipped: true });

  const data = event.data;
  const email = norm(data?.user?.email || data?.email || '');
  const planId = data?.product?.id || data?.plan_id || 'single';
  if (!email) return json({ error: 'No email in payload' }, 400);

  const credits = resolveCredits(planId, data?.quantity || 1);
  const key = `credits:${email}`;
  const ex = await getKV(env.CREDITS, key);
  const rec = { credits: (ex?.credits||0)+credits, email, plan: planId, lastPurchase: new Date().toISOString(), totalPurchased: (ex?.totalPurchased||0)+credits };
  await env.CREDITS.put(key, JSON.stringify(rec), { expirationTtl: 60*60*24*365 });
  return json({ ok: true, email, creditsAdded: credits, totalCredits: rec.credits });
}

function resolveCredits(planId, qty) {
  const id = String(planId).toLowerCase();
  if (id.includes('fifteen')||id.includes('15')) return 15*qty;
  if (id.includes('five')||id.includes('5pack')) return 5*qty;
  return 1*qty;
}

// ── CREDITS CHECK ─────────────────────────────────────────────────────────────
async function handleCreditsCheck(request, env) {
  const session = await validateToken(request.headers.get('X-Session-Token'), env);
  if (!session) return json({ error: 'Invalid or expired session' }, 401);
  const record = await getKV(env.CREDITS, `credits:${session.email}`);
  return json({ email: session.email, credits: record?.credits || 0 });
}

// ── CHAT PROXY ────────────────────────────────────────────────────────────────
async function handleChatProxy(request, env) {
  const session = await validateToken(request.headers.get('X-Session-Token'), env);
  if (!session) return json({ error: 'Invalid or expired session. Re-verify your email.' }, 401);

  const key = `credits:${session.email}`;
  const record = await getKV(env.CREDITS, key);
  if (!record || record.credits < CREDITS_PER_CALL)
    return json({ error: 'No credits remaining.', credits: 0, hint: 'Purchase more at prepaired.ijneb.dev' }, 402);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid body' }, 400); }
  body.model = PAID_MODEL;
  body.max_tokens = Math.min(body.max_tokens || 1000, 1200);

  let ar;
  try {
    ar = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(body),
    });
  } catch (e) { return json({ error: 'Upstream unreachable: '+e.message }, 502); }

  const rd = await ar.json();
  if (ar.ok && !rd.error) {
    const updated = { ...record, credits: record.credits-CREDITS_PER_CALL, lastUsed: new Date().toISOString() };
    await env.CREDITS.put(key, JSON.stringify(updated), { expirationTtl: 60*60*24*365 });
    return new Response(JSON.stringify(rd), { status: ar.status, headers: { ...CORS, 'Content-Type': 'application/json', 'X-Credits-Remaining': String(updated.credits) } });
  }
  return new Response(JSON.stringify(rd), { status: ar.status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
async function issueToken(email, secret) {
  const payload = btoa(JSON.stringify({ email, iat: Date.now() }));
  return `${payload}.${await hmacSign(payload, secret)}`;
}
async function validateToken(token, env) {
  if (!token) return null;
  return await getKV(env.CREDITS, `session:${token}`);
}
async function hmacSign(data, secret) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name:'HMAC', hash:'SHA-256' }, false, ['sign']);
  return bytesToHex(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))));
}
async function timingSafeEqual(a, b) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('ts'), { name:'HMAC', hash:'SHA-256' }, false, ['sign']);
  const [ha,hb] = await Promise.all([crypto.subtle.sign('HMAC',key,new TextEncoder().encode(a)), crypto.subtle.sign('HMAC',key,new TextEncoder().encode(b))]);
  const va=new Uint8Array(ha), vb=new Uint8Array(hb);
  let d=0; for(let i=0;i<va.length;i++) d|=va[i]^vb[i];
  return d===0;
}
async function verifyWhopSig(body, sig, secret) {
  if (!sig||!secret) return false;
  try {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name:'HMAC', hash:'SHA-256' }, false, ['verify']);
    return await crypto.subtle.verify('HMAC', key, hexToBytes(sig.replace('sha256=','')), new TextEncoder().encode(body));
  } catch { return false; }
}
function checkAdmin(request, env) {
  return request.headers.get('X-Admin-Secret') === env.ADMIN_SECRET;
}
async function getKV(ns, key) {
  try { const v=await ns.get(key); return v?JSON.parse(v):null; } catch { return null; }
}
function norm(e) {
  if (!e||typeof e!=='string') return '';
  const t=e.trim().toLowerCase();
  return t.includes('@')?t:'';
}
function json(data, status=200) {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}
function hexToBytes(hex) {
  const b=new Uint8Array(hex.length/2);
  for(let i=0;i<hex.length;i+=2) b[i/2]=parseInt(hex.slice(i,i+2),16);
  return b;
}
function bytesToHex(bytes) {
  return Array.from(bytes).map(b=>b.toString(16).padStart(2,'0')).join('');
}
