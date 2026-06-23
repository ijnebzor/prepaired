#!/usr/bin/env bash
set -euo pipefail

repo="${PREPAIRED_GITHUB_REPO:-ijnebzor/prepaired}"

if ! command -v gh >/dev/null 2>&1; then
  echo "gh is required. Install GitHub CLI and run gh auth login first." >&2
  exit 1
fi

echo "Setting vendor GitHub Actions secrets for $repo"
echo "Values are read silently and are not written to disk."
echo

set_secret() {
  local name="$1"
  local value="${!name:-}"

  if [ -z "$value" ]; then
    printf "%s: " "$name" >&2
    IFS= read -r -s value
    printf "\n" >&2
  fi

  if [ -z "$value" ]; then
    echo "$name is required." >&2
    exit 1
  fi

  printf "%s" "$value" | gh secret set "$name" --repo "$repo" >/dev/null
  echo "Set $name"
}

set_secret CLOUDFLARE_API_TOKEN
set_secret ANTHROPIC_API_KEY
set_secret WHOP_WEBHOOK_SECRET
set_secret RESEND_API_KEY

echo
echo "Vendor secrets are set. Next:"
echo "  gh workflow run 'Deploy Worker' --repo $repo -f target=workers-dev"
echo "  gh run watch --repo $repo"
