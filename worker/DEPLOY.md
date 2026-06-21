# Deploying The PrepAIred Worker

The Worker powers paid Claude credits, OTP auth, Whop fulfillment, and admin credit tools.

Production API: `https://api.prepaired.ijneb.dev`

Note: the production `custom_domain = true` route requires `ijneb.dev` to be an active Cloudflare zone. If the domain is still served from Google Cloud DNS, deploy the Worker to Workers.dev first or move the zone to Cloudflare before relying on `api.prepaired.ijneb.dev`.

For the Workers.dev fallback, the app can be pointed at:

```text
https://ijnebzor.github.io/prepaired/?api=https%3A%2F%2Fprepaired-api.<account-subdomain>.workers.dev
```

The Whop webhook endpoint should match that Worker URL:

```text
https://prepaired-api.<account-subdomain>.workers.dev/webhook/whop
```

## Install

```bash
cd worker
npm ci
```

## Required Secrets

Set these locally with Wrangler. Do not commit secret values.

```bash
npx wrangler secret put ANTHROPIC_API_KEY --env production
npx wrangler secret put WHOP_WEBHOOK_SECRET --env production
npx wrangler secret put SESSION_SECRET --env production
npx wrangler secret put RESEND_API_KEY --env production
npx wrangler secret put FROM_EMAIL --env production
npx wrangler secret put ADMIN_SECRET --env production
```

Use `prepaired@ijneb.dev` for `FROM_EMAIL`.

Generate `SESSION_SECRET` if needed:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Deploy

Dry run:

```bash
npm run deploy:prod -- --dry-run
```

Production deploy:

```bash
npm run deploy:prod
```

Health check:

```bash
curl -sS https://api.prepaired.ijneb.dev/health
```

Expected:

```json
{"status":"ok","version":"2.0.0"}
```

After deployment, run the external launch gate from the repo root:

```bash
node scripts/check-cutover.mjs
```

For a Workers.dev fallback deployment:

```bash
PREPAIRED_API_URL=https://prepaired-api.<account-subdomain>.workers.dev node scripts/check-cutover.mjs --interim
```

## Whop Webhook

Endpoint:

```text
https://api.prepaired.ijneb.dev/webhook/whop
```

Subscribe to:

- `payment.succeeded`
- `membership.activated`
- `membership.created` if available

The Worker verifies Standard Webhooks signatures, supports the older `X-Whop-Signature` fallback, and dedupes by `webhook-id`.

## Credit Packs

Current product ID mapping in `src/index.js`:

| Product | Credits |
|---|---:|
| `prod_fallgfdh0aylb` | 1 |
| `prod_lc38j2nauxdzf` | 5 |
| `prod_r6f1l9ut0jau3` | 15 |

## Manual Credit Grant

```bash
curl -X POST https://api.prepaired.ijneb.dev/admin/gift \
  -H "Content-Type: application/json" \
  -H "X-Admin-Secret: $ADMIN_SECRET" \
  -d '{"email":"test@example.com","credits":3,"note":"launch-test"}'
```

Check credits:

```bash
curl "https://api.prepaired.ijneb.dev/admin/credits?email=test@example.com" \
  -H "X-Admin-Secret: $ADMIN_SECRET"
```

## Monitoring

```bash
npm run tail
```

Watch for:

- OTP send failures
- Whop signature failures
- Duplicate webhook deliveries
- Anthropic proxy errors
- Credit deduction errors
