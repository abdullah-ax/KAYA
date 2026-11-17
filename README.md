# Boardroom

An open-source AI co-founder team that builds the founder as much as the business. It learns who the founder is first, plays to their strengths, and takes an idea through six gated phases toward a tested, sellable digital product. The founder makes every decision, and the system says **stop** when the evidence is weak. It runs free on a local open-weight model.

## Quickstart

```bash
docker compose up
```

Open http://localhost:3000. The first start downloads the local model, which takes a few minutes. Pick "New founder", paste a founder brief, and answer the Profiler's questions by typing or holding the talk button.

## What works and what is mocked

Statuses are updated only after a real run. Working = tested end to end. MOCKED = simulated on purpose. STUBBED = designed, minimal output only.

| Phase | Step | Status |
|---|---|---|
| 1 Discover | Founder intake and profile | STUBBED |
| 1 Discover | Find opportunities (research intern + boss) | STUBBED |
| 1 Discover | Customer interview script | STUBBED |
| 1 Discover | Gate: founder picks an option and explains why | STUBBED |
| 2 Validate | Lean Canvas | STUBBED |
| 2 Validate | Landing page draft | STUBBED |
| 2 Validate | Sign-up target gate (recommends stop on weak evidence) | STUBBED |
| 2 Validate | Shark panel (SIMULATION) | STUBBED |
| 3 Build | User stories and MVP spec | STUBBED |
| 4 Commercial setup | Pricing and draft policies | STUBBED |
| 5 Launch | Store page and launch posts | STUBBED |
| 5 Launch | Payment and automatic delivery | MOCKED |
| 6 Operate | Support, metrics, pivot memo | STUBBED |
| All | Founder approval enforced in code | STUBBED |
| All | Ethics bot, guardrail, judges, decision log | STUBBED |
| All | Voice (local speech to text and text to speech) | STUBBED |

## Architecture

A fixed workflow in plain Python runs the six phases. Each step is done by small agents: an intern drafts, a strict boss checks, and judges and an ethics bot review every step. Every model reply is JSON checked against a schema, and every agent action is appended to `decision_log.json`. A gate ends each step: the founder chooses between options and explains why, and the gate code compares results to targets set in advance. Full design: [ARCHITECTURE.md](ARCHITECTURE.md).

## Models and free resources

- Model: `gpt-oss:20b` via Ollama (open weights). Fallback for smaller machines: `qwen3:8b`.
- Web search: a local SearXNG container, no API key.
- Voice: faster-whisper (MIT) for speech to text, Kokoro-82M (Apache-2.0) for text to speech, both local.
- No paid service is needed. Payments are mocked; nothing is charged.

## Cost per run

About $0.00 per run (local model). Token count per run is measured and reported here after the demo run.

## Demo video

Link added after recording (3 minutes or less).

## What our system will NOT do

- Promise income or success.
- Write fake reviews, testimonials, sign-ups, or countdown timers.
- Pretend to be the founder, a customer, or another brand.
- Hold, move, or refund money; create accounts; store passwords or card numbers.
- Publish, send, spend, or sign anything without the founder's approval in the app.
- Accept a bare "yes" as a decision.
- Help build physical goods, financial, investment or crypto products, or health or legal advice products.
- Lock core features behind a paywall.
- Run on the open internet. The app has no log-in. It is local-only and not meant to be exposed to the internet.

## How the project stays alive after the hackathon

- **Maintainers:** the founding team, listed in `MAINTAINERS.md`.
- **Roadmap:** see the Roadmap section of [ARCHITECTURE.md](ARCHITECTURE.md). First: finish Phases 3–6, add Arabic voice, add more founder lessons.
- **Community:** MIT license. Prompts, templates, and the knowledge base are plain markdown, so non-coders can contribute.
- **Funding:** open-source grants and sponsorships. Every core feature stays free.
