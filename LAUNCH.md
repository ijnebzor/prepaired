# PrepAIred Launch Checklist

Target launch: Friday, June 26, 2026.

Canonical app: `https://prepaired.ijneb.dev`

API: `https://api.prepaired.ijneb.dev`

## User-Run Infrastructure

### DNS

- Add GitHub Pages custom domain:
  - `prepaired.ijneb.dev` CNAME to `ijnebzor.github.io`
  - Once the DNS record resolves, add a root `CNAME` file containing `prepaired.ijneb.dev` or set the same custom domain in GitHub Pages.
- Add Cloudflare Worker custom domain:
  - `api.prepaired.ijneb.dev` attached to Worker `prepaired-api`
  - Cloudflare Worker Custom Domains require `ijneb.dev` to be an active Cloudflare zone. `ijneb.dev` is currently served by Google Cloud DNS, so either move the zone to Cloudflare and recreate the existing Mailgun/Google DNS records there, or use the Workers.dev URL as an interim API and update `WORKER_URL`, CSP, and the Whop webhook endpoint in one release commit.
  - The current `worker/wrangler.toml` is configured for the Cloudflare-zone path.

Current reachable preview until DNS cutover:

```text
https://ijnebzor.github.io/prepaired/
```

Interim Workers.dev API cutover:

- Deploy the Worker to Workers.dev after `wrangler login` succeeds.
- The deployed Workers.dev hostname will be `https://prepaired-api.<account-subdomain>.workers.dev`.
- Test the credit path from:

```text
https://ijnebzor.github.io/prepaired/?api=https%3A%2F%2Fprepaired-api.<account-subdomain>.workers.dev
```

The app accepts only `https://api.prepaired.ijneb.dev` or `https://prepaired-api.<account-subdomain>.workers.dev` as credit API endpoints, and persists a valid override in localStorage. Use `?api=default` to clear it.

### Email

- In Mailgun, add an inbound route:
  - Match recipient: `benji@ijneb.dev`
  - Forward to: `benjiz@gmail.com`
  - Stop processing after match
- In Resend, verify a sending domain/address for:
  - `prepaired@ijneb.dev`
- Keep current Mailgun MX records intact. Add only the Resend DNS records required for sending verification.

### Worker Secrets

Run from `worker/`:

```bash
npx wrangler secret put ANTHROPIC_API_KEY --env production
npx wrangler secret put WHOP_WEBHOOK_SECRET --env production
npx wrangler secret put SESSION_SECRET --env production
npx wrangler secret put RESEND_API_KEY --env production
npx wrangler secret put FROM_EMAIL --env production
npx wrangler secret put ADMIN_SECRET --env production
```

Use `prepaired@ijneb.dev` for `FROM_EMAIL`.

Generate `SESSION_SECRET` locally if needed:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Alternatively, add these GitHub repository secrets and run the manual **Deploy Worker** workflow with `target=workers-dev`:

- `CLOUDFLARE_API_TOKEN`
- `ANTHROPIC_API_KEY`
- `WHOP_WEBHOOK_SECRET`
- `SESSION_SECRET`
- `RESEND_API_KEY`
- `FROM_EMAIL`
- `ADMIN_SECRET`

### Whop

Webhook endpoint:

```text
https://api.prepaired.ijneb.dev/webhook/whop
```

If using the interim Workers.dev API, use:

```text
https://prepaired-api.<account-subdomain>.workers.dev/webhook/whop
```

Subscribe to:

- `payment.succeeded`
- `membership.activated`
- `membership.created` if available

Products:

- 1 credit: `https://whop.com/joined/prepaired/products/1-credit-1-interview/`
- 5 credits: `https://whop.com/joined/prepaired/products/5-credits-5-interviews/`
- 15 credits: `https://whop.com/joined/prepaired/products/15-credits-15-interviews/`

The Worker product ID map is already configured for the current Whop products.

## Local Verification

```bash
node --check worker/src/index.js
node -e "const fs=require('fs'); const html=fs.readFileSync('index.html','utf8'); const scripts=[...html.matchAll(/<script[^>]*>([\\s\\S]*?)<\\/script>/gi)].map(m=>m[1]).join('\\n'); new Function(scripts); console.log('index inline scripts parse ok');"
node scripts/check-launch.mjs
npm --prefix worker ci
npm --prefix worker test
npm --prefix worker run deploy -- --dry-run
npm --prefix worker run deploy:prod -- --dry-run
```

## Runtime Verification

Before switching GitHub Pages to the custom domain, run the full cutover gate:

```bash
node scripts/check-cutover.mjs
```

It must pass before `prepaired.ijneb.dev` is made the public launch URL.

For the interim Workers.dev path, run:

```bash
PREPAIRED_API_URL=https://prepaired-api.<account-subdomain>.workers.dev node scripts/check-cutover.mjs --interim
```

```bash
curl -sS https://api.prepaired.ijneb.dev/health
curl -i -sS -X OPTIONS https://api.prepaired.ijneb.dev/auth/request-otp \
  -H 'Origin: https://prepaired.ijneb.dev' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: Content-Type'
```

Expected health response:

```json
{"status":"ok","version":"2.0.0"}
```

## Launch Smoke Tests

- Open `https://prepaired.ijneb.dev`.
- Confirm the logo, favicon, privacy/support block, and Whop links render.
- Complete one Groq BYOK interview through summary.
- Gift one test credit to your own email via `/admin/gift`.
- Request OTP, verify email delivery from `PrepAIred <prepaired@ijneb.dev>`, and complete one paid Claude session through summary.
- Complete one Whop purchase and confirm the webhook grants credits exactly once.
- Re-deliver the same Whop webhook and confirm credits do not duplicate.
- Send email to `benji@ijneb.dev` and confirm it arrives at `benjiz@gmail.com`.

## Launch Copy

Positioning: soft beta.

Refunds: unused credits refunded on request.

Support: `benji@ijneb.dev`.
