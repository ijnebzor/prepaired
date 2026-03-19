# Deploying PrepAIred API Worker

## Prerequisites

- Cloudflare account (free tier is fine)
- Node.js 18+
- Wrangler CLI: `npm install -g wrangler`
- Whop seller account with products created
- Anthropic API key (your pool key, separate from any personal key)

---

## Step 1 — Cloudflare setup

```bash
# Log in
wrangler login

# Create the KV namespace for credits
wrangler kv:namespace create CREDITS
# → outputs: id = "abc123..."

wrangler kv:namespace create CREDITS --preview
# → outputs: preview_id = "def456..."
```

Copy both IDs into `wrangler.toml`:
```toml
[[kv_namespaces]]
binding = "CREDITS"
id = "abc123..."
preview_id = "def456..."
```

---

## Step 2 — Set secrets

```bash
# Your Anthropic pool key (NOT your personal key — get a separate one)
wrangler secret put ANTHROPIC_API_KEY

# From Whop: Dashboard → Developer → Webhooks → Signing secret
wrangler secret put WHOP_WEBHOOK_SECRET

# Generate a random secret for session token signing
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
wrangler secret put SESSION_SECRET
```

---

## Step 3 — Create Whop products

In Whop Dashboard → Products, create three products:

| Product name | Price | Set in resolveCredits() |
|---|---|---|
| PrepAIred Single | $2 | plan ID contains "single" or default |
| PrepAIred 5-Pack | $5 | plan ID contains "five" or "5pack" |
| PrepAIred 15-Pack | $10 | plan ID contains "fifteen" or "15" |

After creating, copy each product ID and update `resolveCredits()` in `src/index.js` if needed:

```js
function resolveCredits(planId, qty) {
  const id = String(planId).toLowerCase();
  if (id === 'prod_YOUR_15PACK_ID') return 15 * qty;
  if (id === 'prod_YOUR_5PACK_ID') return 5 * qty;
  return 1 * qty;
}
```

---

## Step 4 — Configure Whop webhook

In Whop: Dashboard → Developer → Webhooks → Add endpoint

- URL: `https://prepaired-api.YOUR-SUBDOMAIN.workers.dev/webhook/whop`
- Events to subscribe: `payment.succeeded`, `membership.created`
- Copy the signing secret → `wrangler secret put WHOP_WEBHOOK_SECRET`

---

## Step 5 — Deploy

```bash
cd prepaired-worker
npm install
npm run deploy
```

Test it:
```bash
curl https://prepaired-api.YOUR-SUBDOMAIN.workers.dev/health
# → { "status": "ok", "version": "1.0.0" }
```

---

## Step 6 — Custom domain (optional but recommended)

In Cloudflare Dashboard → Workers & Pages → prepaired-api → Settings → Triggers:

Add route: `api.prepaired.ijneb.dev/*`

Or update `wrangler.toml`:
```toml
[env.production]
route = { pattern = "api.prepaired.ijneb.dev/*", zone_name = "ijneb.dev" }
```

Then: `npm run deploy:prod`

---

## Step 7 — Update index.html

In `index.html`, set the worker URL:

```js
var WORKER_URL = 'https://api.prepaired.ijneb.dev';
```

The UI already has the credit flow built in — users see a "Use Credits" tab in the provider section, enter their email, verify, and the Worker handles the rest.

---

## Manual credit grant (if needed)

To grant credits to a user manually (e.g. comps, refunds):

```bash
# Grant 5 credits to test@example.com
wrangler kv:key put --namespace-id=YOUR_KV_ID \
  "credits:test@example.com" \
  '{"credits":5,"email":"test@example.com","plan":"manual","lastPurchase":"2026-03-20T00:00:00.000Z","totalPurchased":5}'
```

---

## Monitoring

```bash
# Live log stream
wrangler tail

# Check a user's credits
wrangler kv:key get --namespace-id=YOUR_KV_ID "credits:user@example.com"
```

---

## Cost model

Each interview session uses ~10 API calls (10 questions × 3 turns each, avg ~300 tokens in + 400 out).

At Claude Haiku pricing (~$0.00025/1K input, ~$0.00125/1K output):
- Per call: ~$0.0006
- Per 10-question session: ~$0.006
- Per credit (1 interview): ~$0.006 cost vs $2.00 revenue

Margin is healthy. The main cost is the Cloudflare Worker (free tier covers 100k requests/day).
