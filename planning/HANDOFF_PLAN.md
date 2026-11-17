# Plan for Claude Code

Read in this order: `CLAUDE.md` (organizers), `planning/TEAM_RULES.md`, this file, `planning/SCORING.md`, `planning/START_HERE.md`, then the rest of `planning/`.

## Push policy: maximize the score on every push

Every push to `main` may be graded. So `main` only moves forward at checkpoints, and every checkpoint must pass:

1. `python3 scripts/precheck.py` → 0 errors.
2. `python3 -m pytest -q tests` → all pass.
3. The README status table and ARCHITECTURE "Built vs. stubbed" match what a real run proved.

Work happens on branches (cloud sessions push branches by default). Merge to `main` only at a checkpoint. The local pre-push hook blocks a push to `main` that fails 1 or 2: `sh scripts/install_hooks.sh`.

The repo skeleton fails precheck on purpose: `decision_log.json` and `outputs/` must come from a real run. Don't push to `main` until Checkpoint 1.

## Checkpoints (Tuesday)

### Checkpoint 1, by 7:30 PM: smallest real run

- `llm.py` (Ollama + Pydantic, temperature 0, 3 retries), `log.py` (5 required keys + `founder_input`), `approval.py` (no bare yes), `gates.py` (pre-set targets from `config.yaml`).
- `orchestrator.py` runs from the command line: founder brief → Profiler (5 questions) → research intern → boss → Phase 1 gate (founder choice + reason) → Phase 2 Lean Canvas → Phase 2 gate.
- Run 2 briefs: one strong, one weak that ends in STOP. Commit `outputs/` and `decision_log.json` from the weak-brief run (keep the log small).
- Tests: gate stops at 12/100; bare "yes" rejected; log keys present; trick prompts refused; nothing published without approval.
- Update README rows that now work. **Merge to main.**

### Checkpoint 2, by 9:30 PM: MVP in the app

- FastAPI around the orchestrator; Next.js + shadcn/ui + assistant-ui front end matching `planning/mockups/`.
- Judges (one combined judge is fine), ethics bot, guardrail on every request and draft.
- Source cards: `outputs/phase<N>_step<M>_sources.json`.
- `docker compose up` works on a clean machine.
- Re-run the demo, commit fresh outputs and log, update statuses. **Merge to main.**

### Checkpoint 3, by 11:00 PM: polish

- Voice (faster-whisper + Kokoro), brain dump, living mascots (`planning/MASCOTS.md`), daily check-in, shark panel.
- Mock payment and delivery with idempotency and refund, logged to `outputs/payment_test_log.md`.
- Fill MAINTAINERS.md, add the demo video link, measure tokens per run for "Cost per run".
- **Merge to main by 11:30 PM.** Freeze. Final push before 11:59 PM.

Anything unfinished stays labelled STUBBED. Never mark it Working.

## Setup steps (people)

1. Create a private GitHub repo, default branch `main`. Copy everything in this zip's `repo/` folder to the repo root. Push to a branch named `setup` (not main).
2. Connect the repo at hackathon.madsauc.org.
3. At claude.ai/code, sign in with the hackathon account, connect GitHub, install the Claude GitHub app on the repo, create an environment with default settings.
4. Start a session on the repo and paste the kickoff prompt below.
5. On a laptop with ~16 GB RAM: clone, `sh scripts/install_hooks.sh`, `cp .env.example .env`, `docker compose up`, run the demo briefs. Real outputs are made here; the cloud machine may not run the model.

## Kickoff prompt

> Read CLAUDE.md, planning/TEAM_RULES.md, planning/HANDOFF_PLAN.md and planning/SCORING.md first, then everything else in planning/. Use superpowers brainstorming and writing-plans to turn Checkpoint 1 in HANDOFF_PLAN.md into tasks, then build test-first. Work on a branch. Don't touch main until precheck shows 0 errors and all tests pass on a real run. Never write outputs/ or decision_log.json by hand. Ask me before anything that can't be undone.
