# PrepAIred — Roadmap

> HireAId — get PrepAIred.

This is a living document. Updated with each phase.

---

## ✅ Phase 1 — Personal Interview Simulator (current)

Single HTML file, runs locally, uses your own Anthropic API key.

### Delivered
- [x] Setup screen — personality, format, difficulty selection
- [x] 5 interviewer personalities (Warm, Technical, Adversarial, HR/STAR, Curious)
- [x] Interview formats — Panel (2–3 interviewers) and 1:1
- [x] 3 difficulty modes — Relaxed, Realistic, Brutal
- [x] Variable timer by question type and difficulty
- [x] Live character counter with soft/hard limits
- [x] Natural question progression with in-character sign-offs
- [x] Do-over system — max 3 per question, score penalised per attempt
- [x] 4-dimension scoring (Structure, Confidence, Technical Depth, Consulting Readiness)
- [x] Session summary with aggregate scores and per-question verdicts
- [x] Security hardened — rate limiting, input sanitisation, no key persistence

### Known limitations
- No session persistence (refresh = lost progress)
- Questions are hardcoded for Senior Consultant / Secure AI (CyberCX)
- No skip question functionality
- Requires local server (`python3 -m http.server`) to run

---

## 🔨 Phase 2 — Anyone Can Use It

Transform from personal tool to generalist interview simulator.

### Planned
- [ ] Role ingestion — paste a URL, JD text, PDF, or fill a form
- [ ] AI-generated questions from the job description
- [ ] Auto-detect role type, seniority, and key skills from JD
- [ ] Company sentiment summary from public sources
- [ ] Expected salary ranges by role, seniority, and location
- [ ] Save/resume sessions (localStorage or exportable JSON)
- [ ] Skip question functionality
- [ ] Deployable to GitHub Pages (no local server needed)

---

## 🎯 Phase 3 — Negotiation Simulator

Post-interview coaching and offer negotiation.

### Planned
- [ ] Salary negotiation roleplay — offer → counter → response
- [ ] Upper/lower bounds based on role, location, market data
- [ ] Leverage your session performance score in negotiation
- [ ] Coach mode — identifies your strongest interview moments to cite
- [ ] "New business" vs "established team" framing guidance
- [ ] Offer comparison tool — base vs total package vs growth trajectory

---

## Tech philosophy

- No build step. No framework. No dependencies.
- Runs in a browser. Single file where possible.
- Your API key stays yours. Nothing phoned home.
- Built in the open. Commits tell the story.
