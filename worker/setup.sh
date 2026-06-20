#!/usr/bin/env bash
set -euo pipefail

cat <<'EOF'
PrepAIred launch setup

This helper no longer mutates repo files. The launch source of truth is:

  ../LAUNCH.md
  ./DEPLOY.md

From this worker directory, run:

  npm ci
  npx wrangler secret put ANTHROPIC_API_KEY --env production
  npx wrangler secret put WHOP_WEBHOOK_SECRET --env production
  npx wrangler secret put SESSION_SECRET --env production
  npx wrangler secret put RESEND_API_KEY --env production
  npx wrangler secret put FROM_EMAIL --env production
  npx wrangler secret put ADMIN_SECRET --env production
  npm run deploy:prod -- --dry-run
  npm run deploy:prod

Production API:

  https://api.prepaired.ijneb.dev

Whop webhook endpoint:

  https://api.prepaired.ijneb.dev/webhook/whop

Support email route:

  benji@ijneb.dev -> benjiz@gmail.com
EOF
