# PrepAIred

> Interview simulation that does not let you off easy.

[![Live](https://img.shields.io/badge/Live-prepaired.ijneb.dev-00e5cc?style=flat-square)](https://prepaired.ijneb.dev)
[![Version](https://img.shields.io/badge/Version-2.0.0-00e5cc?style=flat-square)](CHANGELOG.md)
[![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)
[![BYOK](https://img.shields.io/badge/Groq-BYOK%20Free-22c55e?style=flat-square)](#providers)
[![Credits](https://img.shields.io/badge/Claude-Credits-eab308?style=flat-square)](#credits)

PrepAIred simulates a real interview or negotiation with an interviewer that pushes back, scores honestly, and keeps the pressure on.

![PrepAIred logo](assets/prepaired-logo.svg)

## Try It

Live app: [prepaired.ijneb.dev](https://prepaired.ijneb.dev)

Local static run:

```bash
git clone https://github.com/ijnebzor/prepaired.git
cd prepaired
python3 -m http.server 8080
open http://localhost:8080
```

## Providers

| Path | Model | User needs | Notes |
|---|---|---|---|
| Free BYOK | Groq Llama 3.1 8B | A Groq API key | Runs directly from the browser to Groq. |
| Paid credits | Claude Haiku 4.5 | A Whop credit purchase | Uses the PrepAIred Cloudflare Worker as a credit proxy. |

Free mode never sends your API key to PrepAIred. Credit mode stores only email-linked credit records, OTP/session records, and webhook idempotency records in Cloudflare KV.

## Credits

Credit packs are sold through Whop:

- [1 credit / 1 interview](https://whop.com/joined/prepaired/products/1-credit-1-interview/)
- [5 credits / 5 interviews](https://whop.com/joined/prepaired/products/5-credits-5-interviews/)
- [15 credits / 15 interviews](https://whop.com/joined/prepaired/products/15-credits-15-interviews/)

One credit is used after a session reaches the summary screen. Unused credits are refundable on request via [benji@ijneb.dev](mailto:benjiz@gmail.com).

## What It Does

- 10-question interview simulations with 2 follow-ups per question
- Interview, salary negotiation, and promotion negotiation modes
- Five interviewer personalities: Warm, Technical, Adversarial, HR/STAR, Curious
- JD and profile/resume input for role-specific questions
- Honest 4D scoring: Structure, Confidence, Technical Depth, Role Readiness
- Session export as local JSON
- Outcome recording in localStorage only

## Security And Privacy

- Groq BYOK calls go directly from browser to Groq.
- Claude credit calls go through the Worker using PrepAIred's pooled Anthropic key.
- API keys are held in JS memory only and cleared on page unload.
- Credit auth uses email OTP, 10-minute expiry, and 5-attempt lockout.
- Whop webhooks are signature-verified and deduped by webhook id.
- No analytics, cookies, ad scripts, or server-side answer/profile storage.

Full details: [SECURITY.md](SECURITY.md)

## Launch Operations

Next-week launch checklist and user-run infrastructure steps live in [LAUNCH.md](LAUNCH.md).

Worker deployment details live in [worker/DEPLOY.md](worker/DEPLOY.md).

## Tech

| Thing | Choice |
|---|---|
| Frontend | Single static `index.html`, vanilla JS, CSS custom properties |
| Hosting | GitHub Pages at `prepaired.ijneb.dev` |
| Credits API | Cloudflare Worker at `api.prepaired.ijneb.dev` |
| Store | Cloudflare KV |
| Payments | Whop webhooks |
| OTP email | Resend |

## License

MIT.

Built by [Benji Zorella](https://ijneb.dev). Support: [benji@ijneb.dev](mailto:benjiz@gmail.com).
