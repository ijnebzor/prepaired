# Security And Privacy

PrepAIred has two execution paths:

- **Free BYOK:** the browser calls Groq directly with the user's Groq API key.
- **Paid credits:** the browser calls the PrepAIred Cloudflare Worker, which calls Anthropic Claude using a pooled server-side key after email OTP verification.

## Data Handling

| Data | Where it goes | Stored by PrepAIred |
|---|---|---|
| Groq API key | Browser to Groq | No |
| Interview answers | Groq or Anthropic for inference | No |
| JD/profile text | Groq or Anthropic for inference | No |
| Credit email | Cloudflare KV | Yes, for credit lookup |
| OTP code/session token | Cloudflare KV | Yes, short TTL |
| Whop webhook ids | Cloudflare KV | Yes, for idempotency |
| Outcome feedback | Browser localStorage | No server storage |

## Controls

- API keys are kept in JS memory and cleared on page unload.
- Groq BYOK mode never sends the user's API key to PrepAIred.
- Credit mode requires a 6-digit email OTP before using credits.
- OTPs expire after 10 minutes and lock after 5 failed attempts.
- Session tokens are HMAC-signed and stored in KV with a 24-hour TTL.
- Chat proxy requests are allowlisted to the Anthropic Messages fields PrepAIred needs.
- Credit sessions are rate-limited to 50 model calls per token per hour.
- Credits are deducted after the summary screen, not per model call.
- Session completion is idempotent per session id.
- Whop webhooks are verified with Standard Webhooks headers and deduped by webhook id.
- No analytics, ad scripts, cookies, or third-party tracking are used.

## Content Security Policy

The static app uses a restrictive CSP for network access:

```text
default-src 'self'
script-src 'unsafe-inline'
style-src 'unsafe-inline' https://fonts.googleapis.com
font-src https://fonts.gstatic.com
connect-src https://api.groq.com https://api.prepaired.ijneb.dev
            https://fonts.googleapis.com https://fonts.gstatic.com
img-src 'self' data:
```

`unsafe-inline` is accepted because PrepAIred is intentionally a single static HTML file without a build step.

## Known Limitations

| Finding | Severity | Status |
|---|---|---|
| API key readable in browser devtools memory during BYOK sessions | Medium | Accepted browser-side BYOK tradeoff |
| LLM responses are rendered through constrained HTML strings | Medium | Inputs are escaped before insertion; further DOM hardening remains useful |
| Prompt injection in user-provided JD/profile text | Low | Wrapped as reference data in prompts; affects only the user's own simulation |
| Credit email stored in KV | Low | Required for paid credits and OTP auth |

## Responsible Disclosure

Do not open a public GitHub issue for security problems.

Email [security@ijneb.dev](mailto:security@ijneb.dev) with:

- Description of the issue
- Steps to reproduce
- Potential impact
- Suggested mitigation, if any

Response target: 5 business days.

## Support And Refunds

For failed credit delivery, account help, or unused-credit refunds, email [benji@ijneb.dev](mailto:benjiz@gmail.com).
