# 📋 Changelog

All notable changes to PrepAIred. Follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [0.3.1] — 2026-03-06

### 🐛 Fixed

- **Critical: entire script silently broken on load.** `getEndMsg()` used apostrophes (`let's`) inside JavaScript template literals, causing a parse error that prevented the script from loading. The Begin Interview button appeared functional but did nothing. Fixed by rewriting all template literal strings to avoid contractions. This was the root cause of the "Begin Interview does nothing" bug.

### ✨ Added

- **Live API key validation** — key is tested against the actual provider API (a minimal ping) before the interview can start. Auth errors surface immediately with a plain-language message.
- **Systems Go panel** — appears below the key input when validation passes. Three green checks: key validated / provider and model name / in-browser execution confirmed.
- **Key status indicator** — cycles `idle → checking → valid / invalid` with colour-coded input border (green valid, red invalid).
- **Begin button locked until validated** — disabled and greyed out with "Validate API key to continue" text. Unlocks and turns cyan only after the key passes. Prevents starting with a broken key.
- **Provider-aware re-validation** — switching provider tab re-runs validation if a key is already present in the field.

### 🔄 Changed

- JavaScript rewritten from ES6+ arrow functions and template literals to more conservative syntax throughout — reduces risk of silent parse failures.
- HTML entities used in place of raw emoji and special characters in HTML body for cross-browser robustness.

---

## [0.3.0] — 2026-03-06

### ✨ Added

- **Landing page** — full marketing page in ijneb.dev aesthetic: animated grid hero, glow blob, feature grid, roadmap phases, footer. Scroll-reactive nav border.
- **Setup modal** — replaces the full-screen setup flow. Opens over the landing page, closeable, scrollable on small viewports.
- **Multi-provider support** — Anthropic Claude Haiku, OpenAI GPT-4o-mini, Groq Llama 3.1 8B. Unified provider abstraction with per-provider headers, body schema, and response extraction.
- **Candidate profile** — three modes: Skip (generic context), Paste Bio/Resume (textarea), LinkedIn/URL. Profile injected into system prompt (800 char limit).
- **Session export** — download full session as JSON: version, timestamp, config, all questions with scores, attempt counts, user answer transcripts.
- **Feedback loop** — outcome recording on summary screen: got it / progressed / rejected / pending / withdrew. Anonymised; stored in localStorage (last 50 sessions).
- **Export button** in interview topbar.

### 🔄 Changed

- Design system: Syne (display) + JetBrains Mono (mono), pure black background, cyan/green/orange/red/purple/yellow accent palette, CRT scanline overlay.
- Personality selection changed from inline buttons to a 5-card grid with icons.
- Difficulty toggle colour-coded: Easy green, Real orange, Brutal red.

### 🔒 Security

- CSP meta header added.
- API key cleared on `beforeunload`.
- 2-second rate limit between submissions.
- Input sanitisation via `sanitiseInput()` on all user text.

---

## [0.2.0] — 2026-03-06

### ✨ Added

- `beforeunload` key clearing.
- Input sanitisation.
- 2-second submission rate limit.
- CSP meta header.
- Attempt indicator dots per question.
- Score penalty notice on do-overs.

### 🔄 Changed

- Timer colour states: cyan → orange at 30s → red + pulse at 15s.
- Progress bar gradient: cyan → green.
- Adversarial personality set as default.

---

## [0.1.0] — 2026-03-06

Initial release.

- 10-question bank for Senior Consultant - Secure AI (Governance) at CyberCX Australia.
- 5 interviewer personalities: Warm, Technical, Adversarial, HR/STAR, Curious.
- Panel (2–3 interviewers) and 1:1 formats.
- Variable timer by question type and difficulty (Relaxed / Real / Brutal).
- 4-dimension scoring with do-overs (max 3, −0.5 penalty per attempt).
- Summary screen with per-question verdicts.
- Anthropic Claude Haiku only.
