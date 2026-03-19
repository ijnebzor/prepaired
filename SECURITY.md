# 🔒 Security

> **Your key never leaves your hands. This is the design, not a feature.**

PrepAIred is a client-side-only application. No server. No database. No backend. Everything runs in your browser.

---

## 🛡️ What We Protect

| Asset | How |
|---|---|
| **Your API key** | In-memory only; cleared on page unload; validated live then never re-transmitted |
| **Your answers** | Never leave your browser except in the API call to your chosen provider |
| **Your profile text** | Sent only in the system prompt to your chosen provider, truncated to 800 chars |
| **Session data** | Stays in-browser; export is manual, client-side JSON only |
| **Outcome data** | Anonymised; stored only in your own localStorage |

## ⚠️ What We Don't Protect Against

| Threat | Notes |
|---|---|
| Compromised API provider | If your provider's API is compromised, responses could be manipulated |
| Malicious browser extension | Extensions with page access can read in-memory JS variables |
| Physical access to your machine | Standard OpSec — outside scope |
| Devtools key inspection | Key is readable in the JS heap during the session (see below) |

---

## 🔐 Controls

### API Key Handling

- Password-type input field — never visible unless you toggle it
- **Validated live** against the actual provider API before the interview can start — the Begin button is locked until the key passes
- Stored in a JS object (`cfg.apiKey`) for the session duration only
- Cleared via `window.addEventListener('beforeunload', ...)` on page close/refresh
- Never written to `localStorage`, `sessionStorage`, cookies, or any server

> ⚠️ **Known limitation (Medium):** The key is readable in browser devtools memory (`cfg.apiKey`) during the session. Accepted trade-off for a zero-backend design. If this concerns you: use a minimal-permission key, or rotate the key after each session. Anthropic keys can be restricted to `claude-haiku` level via the console.

---

### Content Security Policy

Applied via `<meta http-equiv="Content-Security-Policy">`:

```
default-src 'self'
script-src 'unsafe-inline'
style-src 'unsafe-inline' https://fonts.googleapis.com
font-src https://fonts.gstatic.com
connect-src https://api.anthropic.com https://api.groq.com https://api.openai.com
            https://fonts.googleapis.com https://fonts.gstatic.com
img-src 'self' data:
```

**Why `unsafe-inline`?** PrepAIred is a single HTML file. Inline scripts are required by design. A nonce-based approach would require a build pipeline, which contradicts the zero-dependency architecture. `unsafe-inline` is the accepted cost.

**Why `connect-src` matters more than it looks:** Even if an attacker injected JavaScript (via the `innerHTML` vector below), they cannot exfiltrate data to an attacker-controlled domain — the CSP restricts all outbound connections to the three approved provider APIs and Google Fonts. Data exfiltration via network is blocked at the browser level.

---

### Input Sanitisation

All user input passes through `sanitiseInput()` before touching the API:

```javascript
function sanitiseInput(s) {
  return typeof s !== 'string' ? '' :
    s.replace(/<[^>]*>/g, '')  // strip HTML tags
     .replace(/[<>]/g, '')     // remove remaining angle brackets
     .trim()
     .substring(0, 600);       // hard character limit
}
```

---

### AI Response Rendering

> ⚠️ **Known limitation (High):** AI responses (interviewer messages) are rendered via `.innerHTML`. A malicious or compromised API response containing HTML/JavaScript could execute in the page context.

**Mitigating factors:**
- `connect-src` CSP blocks data exfiltration to arbitrary domains even if JS executes
- You are making authenticated calls using your own API key — response manipulation requires your provider's endpoint to be compromised at the network level
- Practical attack surface is low for individual BYOK usage

**Planned fix:** Coach responses will be sanitised through a strip-and-reconstruct pipeline before DOM insertion. Tracked for v0.4.

---

### Rate Limiting

| Control | Value |
|---|---|
| Minimum between answer submissions | 2 seconds |
| Key validation debounce | 800ms |
| Do-overs per question | 3 maximum |

---

### localStorage

Only anonymised outcome data is written to `localStorage`:

```json
{
  "date": "2026-03-06T...",
  "outcome": "progressed",
  "avgScore": "7.2",
  "provider": "anthropic",
  "difficulty": "realistic"
}
```

No question text. No answers. No API keys. No profile data. Capped at 50 entries.

---

### Prompt Injection

> ℹ️ **Known limitation (Low):** Profile text is inserted directly into the interviewer system prompt. Adversarially crafted profile text could alter the interviewer's behaviour.

This is self-inflicted — the only person affected is the user themselves. No mitigations planned.

---

## 📦 Third-Party Dependencies

| Dependency | Type | Purpose | Risk |
|---|---|---|---|
| Google Fonts | CSS `@import` | Syne + JetBrains Mono | Low — CSS only, no script execution |
| Anthropic API | `fetch` | AI inference | Trusted; scoped by CSP |
| OpenAI API | `fetch` | AI inference | Trusted; scoped by CSP |
| Groq API | `fetch` | AI inference | Trusted; scoped by CSP |

No npm packages. No CDN scripts. No analytics. No ad networks.

---

## 🔍 Audit Summary

| Finding | Severity | Status |
|---|---|---|
| AI response `innerHTML` injection | **High** | Open — mitigated by CSP; fix planned v0.4 |
| API key readable in devtools memory | **Medium** | Accepted — inherent to client-only BYOK design |
| Profile text prompt injection | **Low** | Accepted — self-inflicted risk only |
| Missing URL validation on profile URL input | **Low** | Open |
| `unsafe-inline` in CSP | **Info** | Accepted — required for single-file architecture |

---

## 📬 Responsible Disclosure

If you find a security issue:

1. **Do not open a public GitHub issue**
2. Email **[security@ijneb.dev](mailto:security@ijneb.dev)** with:
   - Description of the issue
   - Steps to reproduce
   - Potential impact
   - Any suggested mitigations

Response target: 5 business days.

---

## 📋 Version History

| Version | Security changes |
|---|---|
| 0.1 | Initial release — basic key handling |
| 0.2 | `beforeunload` key clearing · input sanitisation · rate limiting · CSP meta header |
| 0.3 | Multi-provider key handling · validation debounce |
| **0.3.1** | **Live API key validation · Systems Go panel · Begin button locked until key passes** |

---

*Maintained by [Benji Zorella](https://ijneb.dev)*
