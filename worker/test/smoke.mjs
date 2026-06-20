import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import worker from '../src/index.js';

class MemoryKV {
  constructor() {
    this.records = new Map();
  }

  async get(key) {
    const record = this.records.get(key);
    if (!record) return null;
    if (record.expiresAt && record.expiresAt <= Date.now()) {
      this.records.delete(key);
      return null;
    }
    return record.value;
  }

  async put(key, value, options = {}) {
    const ttl = Number(options.expirationTtl || 0);
    this.records.set(key, {
      value,
      expiresAt: ttl > 0 ? Date.now() + ttl * 1000 : null,
    });
  }

  async delete(key) {
    this.records.delete(key);
  }

  async json(key) {
    const value = await this.get(key);
    return value ? JSON.parse(value) : null;
  }
}

const kv = new MemoryKV();
const env = {
  CREDITS: kv,
  WHOP_WEBHOOK_SECRET: 'launch-webhook-secret',
  SESSION_SECRET: 'launch-session-secret',
  ADMIN_SECRET: 'launch-admin-secret',
  ANTHROPIC_API_KEY: 'launch-anthropic-key',
  RESEND_API_KEY: 'launch-resend-key',
  FROM_EMAIL: 'prepaired@ijneb.dev',
};

function jsonRequest(url, body, options = {}) {
  return new Request(url, {
    method: options.method || 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    body: JSON.stringify(body),
  });
}

function whopRequest(event, id, secret = env.WHOP_WEBHOOK_SECRET, signatureOverride) {
  const body = JSON.stringify(event);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac('sha256', secret)
    .update(`${id}.${timestamp}.${body}`)
    .digest('base64');

  return new Request('https://api.prepaired.ijneb.dev/webhook/whop', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'webhook-id': id,
      'webhook-timestamp': timestamp,
      'webhook-signature': signatureOverride || `v1,${signature}`,
    },
    body,
  });
}

function sessionToken(email) {
  const payload = btoa(JSON.stringify({ email, iat: Date.now() }));
  const signature = createHmac('sha256', env.SESSION_SECRET)
    .update(payload)
    .digest('hex');
  return `${payload}.${signature}`;
}

async function responseJson(response) {
  return JSON.parse(await response.text());
}

let response = await worker.fetch(new Request('https://api.prepaired.ijneb.dev/health'), env);
assert.equal(response.status, 200);
assert.deepEqual(await responseJson(response), { status: 'ok', version: '2.0.0' });

response = await worker.fetch(new Request('https://api.prepaired.ijneb.dev/auth/request-otp', {
  method: 'OPTIONS',
  headers: {
    Origin: 'https://prepaired.ijneb.dev',
    'Access-Control-Request-Method': 'POST',
    'Access-Control-Request-Headers': 'Content-Type',
  },
}), env);
assert.equal(response.status, 200);
assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://prepaired.ijneb.dev');

const whopEvent = {
  type: 'payment.succeeded',
  data: {
    customer: { email: 'Buyer@Example.com' },
    product: { id: 'prod_lc38j2naUxDzF' },
  },
};

response = await worker.fetch(whopRequest(whopEvent, 'msg_launch_1'), env);
assert.equal(response.status, 200);
assert.deepEqual(await responseJson(response), {
  ok: true,
  email: 'buyer@example.com',
  creditsAdded: 5,
  totalCredits: 5,
});
assert.equal((await kv.json('credits:buyer@example.com')).credits, 5);

response = await worker.fetch(whopRequest(whopEvent, 'msg_launch_1'), env);
assert.equal(response.status, 200);
assert.deepEqual(await responseJson(response), {
  ok: true,
  duplicate: true,
  email: 'buyer@example.com',
  creditsAdded: 5,
});
assert.equal((await kv.json('credits:buyer@example.com')).credits, 5);

response = await worker.fetch(whopRequest(whopEvent, 'msg_launch_bad_sig', env.WHOP_WEBHOOK_SECRET, 'v1,not-valid'), env);
assert.equal(response.status, 401);

response = await worker.fetch(jsonRequest('https://api.prepaired.ijneb.dev/admin/gift', {
  email: 'beta@example.com',
  credits: 3,
  note: 'launch-test',
}, {
  headers: { 'X-Admin-Secret': env.ADMIN_SECRET },
}), env);
assert.equal(response.status, 200);
assert.equal((await responseJson(response)).results[0].after, 3);

response = await worker.fetch(new Request('https://api.prepaired.ijneb.dev/admin/credits?email=beta@example.com', {
  headers: { 'X-Admin-Secret': env.ADMIN_SECRET },
}), env);
assert.equal(response.status, 200);
assert.equal((await responseJson(response)).credits, 3);

const email = 'paid@example.com';
const token = sessionToken(email);
await kv.put(`credits:${email}`, JSON.stringify({ email, credits: 2, plan: 'test', totalPurchased: 2 }));
await kv.put(`session:${token}`, JSON.stringify({ email, issued: new Date().toISOString() }));

response = await worker.fetch(jsonRequest('https://api.prepaired.ijneb.dev/api/session-complete', {
  sessionId: 'local-session-1',
}, {
  headers: { 'X-Session-Token': token },
}), env);
assert.equal(response.status, 200);
assert.deepEqual(await responseJson(response), { ok: true, credits: 1 });
assert.equal((await kv.json(`credits:${email}`)).credits, 1);

response = await worker.fetch(jsonRequest('https://api.prepaired.ijneb.dev/api/session-complete', {
  sessionId: 'local-session-1',
}, {
  headers: { 'X-Session-Token': token },
}), env);
assert.equal(response.status, 200);
assert.deepEqual(await responseJson(response), { ok: true, credits: 1, alreadyCompleted: true });
assert.equal((await kv.json(`credits:${email}`)).credits, 1);

console.log('worker smoke tests passed');
