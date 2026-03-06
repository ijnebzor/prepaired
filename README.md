# PrepAIred 🎯
### HireAId — get PrepAIred.

An AI-powered interview simulator that runs entirely in your browser, uses your own Anthropic API key, and costs pennies per session.

Built because I was prepping for a real interview and wanted something that would actually push back on me — not just give me a gold star for turning up.

---

## What it does

You pick an interviewer personality, a format, and a difficulty level. Then you answer real interview questions in a timed, coached environment. After each answer, the AI responds in character, scores you across four dimensions, and gives you a verdict. You can do it over (up to 3 times, with score penalties for repeats). At the end you get a full session summary.

It's not a quiz. It's not a flashcard app. It's a dry run.

---

## Interviewer personalities

| Mode | Vibe |
|---|---|
| ☀️ Warm | Supportive, conversational, still probes gaps |
| 🔬 Technical | Drills into specifics, challenges vague answers |
| ⚔️ Adversarial | Pushes back on everything, stress-tests positions |
| 📋 HR / STAR | STAR method, culture fit, wants real examples |
| 🔭 Curious | Asks why and how, goes off-script if something's interesting |

---

## Interview formats

- **Panel** — 2–3 interviewers blended, lead personality drives
- **1:1** — single interviewer, one personality, more focused

---

## Difficulty modes

- 🟢 **Relaxed** — more time, good for early prep
- 🟡 **Realistic** — interview-paced timing
- 🔴 **Brutal** — tight limits, no grace

---

## Scoring

Each answer is scored across:
- **Structure** — did you actually answer the question?
- **Confidence** — did you sound like you believed it?
- **Technical Depth** — did you know what you were talking about?
- **Consulting Readiness** — would a client trust you with this?

Do-overs are allowed (max 3 per question) but the score is penalised per attempt. Because that's how it works in real life too.

---

## Setup

No install. No server. One HTML file.

```bash
git clone https://github.com/ijneb/prepaired.git
cd prepaired
python3 -m http.server 8080
```

Open `http://localhost:8080` and add your Anthropic API key on the setup screen.

> ⚠️ Must be served over `http://` — opening the file directly (`file://`) will block the API call due to browser CORS restrictions.

You'll need an [Anthropic API key](https://console.anthropic.com). The app uses `claude-haiku-4-5` by default — the cheapest Claude model. A full 10-question session costs a few cents.

---

## Roadmap

This started as personal interview prep. It's becoming something more general.

**Phase 2 — Anyone can use it**
- Paste a job URL, a JD, or fill in a form
- AI generates role-specific questions from the JD
- Company sentiment from public sources
- Expected salary ranges by role and location

**Phase 3 — Negotiation simulator**
- Post-interview offer coaching
- Upper/lower salary bounds based on role, market, and your session performance
- How to leverage the interview itself in negotiation

---

## Tech

- Vanilla HTML/CSS/JS — single file, no build step, no dependencies
- Anthropic API (`claude-haiku-4-5`) via direct browser fetch
- Your API key stays in your browser — nothing is stored or sent anywhere else

---

## Built with

AI-assisted development using Claude. The prompts, product decisions, and direction are mine. The velocity is not entirely human.

Disciplines: `Development` · `Cyber Security` · `AIthropology`

[ijneb.dev](https://ijneb.dev)
