#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# PrepAIred Worker — interactive setup script
# Run this once from inside the /worker directory after cloning the repo.
# Everything is CLI. The only browser steps are noted inline.
# ─────────────────────────────────────────────────────────────────────────────

set -e

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

banner() {
  echo ""
  echo -e "${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${CYAN}${BOLD}  $1${NC}"
  echo -e "${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
}

step() {
  echo -e "${GREEN}${BOLD}▶ $1${NC}"
}

info() {
  echo -e "${DIM}  $1${NC}"
}

warn() {
  echo -e "${YELLOW}  ⚠  $1${NC}"
}

ask() {
  echo -e "${BOLD}  $1${NC}"
  read -r REPLY
  echo "$REPLY"
}

pause() {
  echo -e "${YELLOW}  Press Enter when done...${NC}"
  read -r
}

# ─────────────────────────────────────────────────────────────────────────────
banner "PrepAIred Worker Setup"
echo -e "  This script deploys your Cloudflare Worker and wires up Whop payments."
echo -e "  Takes about ${BOLD}10–15 minutes${NC}. Everything runs here in your terminal."
echo -e "  You'll need two browser windows open: ${BOLD}Cloudflare${NC} and ${BOLD}Whop${NC}."
echo ""
echo -e "  ${DIM}Before starting, make sure you have:${NC}"
echo -e "  ${DIM}  • A Cloudflare account (free.cloudflare.com)${NC}"
echo -e "  ${DIM}  • A Whop seller account (whop.com/sell)${NC}"
echo -e "  ${DIM}  • Node.js 18+ installed (node --version to check)${NC}"
echo -e "  ${DIM}  • An Anthropic API key to use as your pool key${NC}"
echo ""
echo -e "  Press Enter to begin..."
read -r

# ─────────────────────────────────────────────────────────────────────────────
banner "Step 1 — Check prerequisites"

step "Checking Node.js..."
if ! command -v node &>/dev/null; then
  echo -e "${RED}  ✗ Node.js not found. Install from nodejs.org then re-run this script.${NC}"
  exit 1
fi
NODE_VER=$(node --version)
echo -e "  ${GREEN}✓ Node.js $NODE_VER${NC}"

step "Checking npm..."
if ! command -v npm &>/dev/null; then
  echo -e "${RED}  ✗ npm not found.${NC}"
  exit 1
fi
echo -e "  ${GREEN}✓ npm $(npm --version)${NC}"

step "Installing wrangler..."
npm install --save-dev wrangler
echo -e "  ${GREEN}✓ wrangler installed${NC}"

# ─────────────────────────────────────────────────────────────────────────────
banner "Step 2 — Log into Cloudflare"

step "Opening Cloudflare login..."
info "This will open a browser window. Log in to your Cloudflare account."
info "If you don't have one: cloudflare.com (free tier is enough)"
echo ""
npx wrangler login
echo -e "  ${GREEN}✓ Logged in to Cloudflare${NC}"

# ─────────────────────────────────────────────────────────────────────────────
banner "Step 3 — Create KV namespace for credits"

step "Creating CREDITS KV namespace (production)..."
KV_OUTPUT=$(npx wrangler kv:namespace create CREDITS 2>&1)
echo "$KV_OUTPUT"
KV_ID=$(echo "$KV_OUTPUT" | grep -o '"id": "[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$KV_ID" ]; then
  warn "Could not auto-detect KV ID from output above."
  KV_ID=$(ask "  Paste the 'id' value from the output above:")
fi
echo -e "  ${GREEN}✓ KV ID: $KV_ID${NC}"

step "Creating CREDITS KV namespace (preview)..."
KV_PREVIEW_OUTPUT=$(npx wrangler kv:namespace create CREDITS --preview 2>&1)
echo "$KV_PREVIEW_OUTPUT"
KV_PREVIEW_ID=$(echo "$KV_PREVIEW_OUTPUT" | grep -o '"preview_id": "[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$KV_PREVIEW_ID" ]; then
  KV_PREVIEW_ID=$(ask "  Paste the 'preview_id' value from the output above:")
fi
echo -e "  ${GREEN}✓ Preview KV ID: $KV_PREVIEW_ID${NC}"

step "Writing KV IDs into wrangler.toml..."
# Replace placeholder IDs in wrangler.toml
sed -i.bak \
  "s/REPLACE_WITH_YOUR_KV_NAMESPACE_ID/$KV_ID/g" \
  wrangler.toml
sed -i.bak \
  "s/REPLACE_WITH_YOUR_KV_NAMESPACE_PREVIEW_ID/$KV_PREVIEW_ID/g" \
  wrangler.toml
rm -f wrangler.toml.bak
echo -e "  ${GREEN}✓ wrangler.toml updated${NC}"

# ─────────────────────────────────────────────────────────────────────────────
banner "Step 4 — Set secrets"

echo -e "  You'll enter 3 secrets. They are sent directly to Cloudflare"
echo -e "  and never stored locally or in this script."
echo ""

step "Secret 1: ANTHROPIC_API_KEY"
info "Your Anthropic pool key. Get one at console.anthropic.com"
info "Tip: create a separate key just for PrepAIred (not your personal key)"
info "It only needs access to claude-haiku — you can restrict it in Anthropic console"
echo ""
echo -e "  Enter your Anthropic API key (input hidden):"
npx wrangler secret put ANTHROPIC_API_KEY
echo -e "  ${GREEN}✓ ANTHROPIC_API_KEY set${NC}"
echo ""

step "Secret 2: SESSION_SECRET"
info "A random 32-byte hex string used to sign session tokens."
info "Generating one for you now..."
SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
echo -e "  Generated: ${DIM}$SESSION_SECRET${NC}"
echo -e "  Setting it now..."
echo "$SESSION_SECRET" | npx wrangler secret put SESSION_SECRET
echo -e "  ${GREEN}✓ SESSION_SECRET set${NC}"
echo ""

step "Secret 3: WHOP_WEBHOOK_SECRET"
info "You'll get this from Whop in Step 6 (webhook setup)."
info "For now, set a placeholder — you'll update it after creating the Whop webhook."
echo ""
echo -e "  ${YELLOW}Skip for now? (y) or enter your Whop webhook secret if you have it:${NC}"
read -r WHOP_SECRET_REPLY
if [ "$WHOP_SECRET_REPLY" = "y" ] || [ -z "$WHOP_SECRET_REPLY" ]; then
  echo "placeholder_update_after_whop_setup" | npx wrangler secret put WHOP_WEBHOOK_SECRET
  warn "Placeholder set — remember to update this after Step 6"
else
  echo "$WHOP_SECRET_REPLY" | npx wrangler secret put WHOP_WEBHOOK_SECRET
  echo -e "  ${GREEN}✓ WHOP_WEBHOOK_SECRET set${NC}"
fi

# ─────────────────────────────────────────────────────────────────────────────
banner "Step 5 — Deploy the Worker"

step "Deploying to Cloudflare Workers..."
npx wrangler deploy
echo ""

# Extract worker URL from output
WORKER_URL_GUESS="prepaired-api.$(npx wrangler whoami 2>/dev/null | grep -o '[a-z0-9]*\.workers\.dev' | head -1 || echo 'YOUR-SUBDOMAIN.workers.dev')"
echo ""
step "Testing the health endpoint..."
sleep 3  # give CF a moment
HEALTH=$(curl -s "https://prepaired-api.$(npx wrangler whoami 2>/dev/null | grep -oP '(?<=@)[^\s]+' | head -1 || echo 'YOUR-SUBDOMAIN').workers.dev/health" 2>/dev/null || echo "")
if echo "$HEALTH" | grep -q '"ok"'; then
  echo -e "  ${GREEN}✓ Worker is live and healthy${NC}"
  echo -e "  ${DIM}Response: $HEALTH${NC}"
else
  warn "Could not auto-verify. Test manually:"
  echo ""
  echo -e "  ${BOLD}Run:${NC} curl https://YOUR-WORKER-URL.workers.dev/health"
  echo -e "  ${BOLD}Expect:${NC} {\"status\":\"ok\",\"version\":\"1.0.0\"}"
fi

echo ""
step "What is your Worker URL?"
info "Check the output above — it will say something like:"
info "  Published prepaired-api (https://prepaired-api.YOURNAME.workers.dev)"
WORKER_URL=$(ask "  Paste your Worker URL (e.g. https://prepaired-api.yourname.workers.dev):")

# ─────────────────────────────────────────────────────────────────────────────
banner "Step 6 — Set up Whop products (browser)"

echo -e "  ${BOLD}Open: https://whop.com/dashboard${NC}"
echo ""
echo -e "  Create 3 products — use these exact names so the Worker recognises them:"
echo ""
echo -e "  ${BOLD}┌─────────────────────┬────────┬───────────────┐${NC}"
echo -e "  ${BOLD}│ Product name        │ Price  │ Credits       │${NC}"
echo -e "  ${BOLD}├─────────────────────┼────────┼───────────────┤${NC}"
echo -e "  ${BOLD}│ PrepAIred Single    │ \$2.00  │ 1 interview   │${NC}"
echo -e "  ${BOLD}│ PrepAIred 5-Pack    │ \$5.00  │ 5 interviews  │${NC}"
echo -e "  ${BOLD}│ PrepAIred 15-Pack   │ \$10.00 │ 15 interviews │${NC}"
echo -e "  ${BOLD}└─────────────────────┴────────┴───────────────┘${NC}"
echo ""
info "In each product: set type to 'One-time purchase', not subscription"
info "Copy the checkout URL for each — you'll need them in Step 8"
echo ""
pause

step "Getting your Whop product checkout URLs..."
WHOP_SINGLE=$(ask "  PrepAIred Single checkout URL (from Whop):")
WHOP_FIVE=$(ask "  PrepAIred 5-Pack checkout URL:")
WHOP_FIFTEEN=$(ask "  PrepAIred 15-Pack checkout URL:")

# ─────────────────────────────────────────────────────────────────────────────
banner "Step 7 — Set up Whop webhook (browser)"

echo -e "  In Whop Dashboard → ${BOLD}Developer → Webhooks → Add endpoint${NC}"
echo ""
echo -e "  ${BOLD}Endpoint URL:${NC}"
echo -e "  ${CYAN}  $WORKER_URL/webhook/whop${NC}"
echo ""
echo -e "  ${BOLD}Events to subscribe:${NC}"
echo -e "    ✓ payment.succeeded"
echo -e "    ✓ membership.created"
echo ""
info "After saving, Whop will show you a Signing Secret."
info "Copy it — you need it for the next step."
echo ""
pause

step "Updating WHOP_WEBHOOK_SECRET..."
echo -e "  Paste your Whop webhook signing secret (input hidden):"
npx wrangler secret put WHOP_WEBHOOK_SECRET
echo -e "  ${GREEN}✓ WHOP_WEBHOOK_SECRET updated${NC}"

# ─────────────────────────────────────────────────────────────────────────────
banner "Step 8 — Update index.html with Worker URL + Whop URLs"

REPO_ROOT=$(cd .. && pwd)
INDEX_FILE="$REPO_ROOT/index.html"

if [ ! -f "$INDEX_FILE" ]; then
  warn "Could not find $INDEX_FILE — you may need to do this step manually"
  INDEX_FILE=$(ask "  Full path to your index.html:")
fi

step "Patching index.html..."

# Update Worker URL
sed -i.bak "s|https://prepaired-api.ijnebzor.workers.dev|$WORKER_URL|g" "$INDEX_FILE"

# Update Whop checkout URLs
sed -i.bak "s|WHOP_SINGLE_URL|$WHOP_SINGLE|g" "$INDEX_FILE"
sed -i.bak "s|WHOP_5PACK_URL|$WHOP_FIVE|g" "$INDEX_FILE"
sed -i.bak "s|WHOP_15PACK_URL|$WHOP_FIFTEEN|g" "$INDEX_FILE"
rm -f "$INDEX_FILE.bak"

echo -e "  ${GREEN}✓ index.html updated${NC}"
echo ""

# ─────────────────────────────────────────────────────────────────────────────
banner "Step 9 — Push index.html to GitHub"

cd "$REPO_ROOT"
if git status &>/dev/null; then
  step "Committing changes..."
  git add index.html
  git commit -m "feat: wire up Worker URL and Whop checkout URLs"
  git push
  echo -e "  ${GREEN}✓ Pushed to GitHub — GitHub Pages will update in ~2 minutes${NC}"
else
  warn "Not a git repo or git not configured — push index.html manually"
fi

# ─────────────────────────────────────────────────────────────────────────────
banner "Step 10 — Test end to end"

echo -e "  Run these tests to verify everything is working:"
echo ""
echo -e "  ${BOLD}1. Health check:${NC}"
echo -e "  ${CYAN}  curl $WORKER_URL/health${NC}"
echo -e "  ${DIM}  Expected: {\"status\":\"ok\",\"version\":\"1.0.0\"}${NC}"
echo ""
echo -e "  ${BOLD}2. Grant yourself test credits (to verify the flow):${NC}"
echo -e "  ${CYAN}  npx wrangler kv:key put --namespace-id=$KV_ID \\${NC}"
echo -e "  ${CYAN}    'credits:YOUR@EMAIL.COM' \\${NC}"
echo -e "  ${CYAN}    '{\"credits\":3,\"email\":\"your@email.com\",\"plan\":\"test\",\"lastPurchase\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"totalPurchased\":3}'${NC}"
echo ""
echo -e "  ${BOLD}3. Verify the credit lookup:${NC}"
echo -e "  ${CYAN}  curl -X POST $WORKER_URL/auth/verify \\${NC}"
echo -e "  ${CYAN}    -H 'Content-Type: application/json' \\${NC}"
echo -e "  ${CYAN}    -d '{\"email\":\"your@email.com\"}'${NC}"
echo -e "  ${DIM}  Expected: {\"ok\":true,\"token\":\"...\",\"credits\":3}${NC}"
echo ""
echo -e "  ${BOLD}4. Open the live site and test the Credits tab:${NC}"
echo -e "  ${CYAN}  https://ijnebzor.github.io/prepaired${NC}"
echo ""

# ─────────────────────────────────────────────────────────────────────────────
banner "Useful commands to keep handy"

echo -e "  ${BOLD}Watch live Worker logs:${NC}"
echo -e "  ${CYAN}  npx wrangler tail${NC}"
echo ""
echo -e "  ${BOLD}Check a user's credits:${NC}"
echo -e "  ${CYAN}  npx wrangler kv:key get --namespace-id=$KV_ID 'credits:USER@EMAIL.COM'${NC}"
echo ""
echo -e "  ${BOLD}Grant credits manually (refund / comp):${NC}"
echo -e "  ${CYAN}  npx wrangler kv:key put --namespace-id=$KV_ID \\${NC}"
echo -e "  ${CYAN}    'credits:USER@EMAIL.COM' '{\"credits\":5,...}'${NC}"
echo ""
echo -e "  ${BOLD}Redeploy after code changes:${NC}"
echo -e "  ${CYAN}  cd worker && npx wrangler deploy${NC}"
echo ""
echo -e "  ${BOLD}Add custom domain (api.prepaired.ijneb.dev):${NC}"
echo -e "  ${CYAN}  # In Cloudflare Dashboard → Workers → prepaired-api → Settings → Domains${NC}"
echo -e "  ${CYAN}  # Add: api.prepaired.ijneb.dev${NC}"
echo -e "  ${CYAN}  # Then update WORKER_URL in index.html and redeploy${NC}"
echo ""

# ─────────────────────────────────────────────────────────────────────────────
echo -e "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}${BOLD}  Setup complete.${NC}"
echo -e "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  Worker: ${CYAN}$WORKER_URL${NC}"
echo -e "  Site:   ${CYAN}https://ijnebzor.github.io/prepaired${NC}"
echo ""
echo -e "  ${DIM}Reminder: revoke the GitHub token you used earlier${NC}"
echo -e "  ${DIM}github.com → Settings → Developer settings → Personal access tokens${NC}"
echo ""
