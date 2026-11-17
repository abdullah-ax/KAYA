# START HERE

This pack holds everything the hackathon Claude account needs to build our entry. Read this file first. Then read the rest in the order shown in "Files".

## What we are building

An open-source team of AI agents. It helps a founder go from idea to a tested, sellable digital product. It starts with the founder, not the idea. It never moves on without the founder's own thinking.

Six rules decide everything:

1. **Founder first.** Learn who the founder is before talking about ideas: skills, people they know, groups they belong to, money, time, values.
2. **The founder does the thinking.** No bare "yes". Every gate makes the founder pick between options and explain why in their own words.
3. **Every claim has a link or the label `ASSUMPTION`.** Every source gets a source card: type, trust level, why, and which sentence it backs (`repo_seed/templates/source_card.md`). Low-trust sources never stand alone behind a gate decision.
4. **No slop.** 8th-grade reading level. Every sentence adds a fact, a number, a name, or a decision.
5. **Say stop when the proof is weak.**
6. **Ethics bot on every request, draft, and gate.** It blocks deception, fixes manipulative design, and flags privacy and local-law issues (`repo_seed/prompts/ethics_bot.md`).

## Three flags

- **Deadline.** Final push is Tuesday 11:59 PM. We aim for a working MVP by 10:00 PM and a push to `main` by 11:30 PM.
- **Payments.** Mocks only. The organizers' problem statement says no payments of any kind, not even sandbox. This is stricter than CLAUDE.md. Follow the stricter rule.
- **Live demo.** Judges hand us a founder brief we haven't seen and watch for 3 minutes. Demo mode must keep every check but accept short answers.

## Files

| Path | What it is | Goes in the repo? |
|---|---|---|
| `START_HERE.md` | This file | No |
| `planning/DEV_PRACTICES.md` | How we build: test first, small steps, UI loop, agent design rules | No |
| `planning/SKILLS_TO_INSTALL.md` | Exact install commands for skills and plugins | No |
| `planning/FOUNDER_LOOP.md` | The product's core loop: intake, co-founder, gates, daily check-in, shark panel | No |
| `planning/UI_INSPIRATION.md` | Real products to study for our screens | No |
| `planning/OPEN_SOURCE_TO_BORROW.md` | Open-source projects to copy patterns from | No |
| `planning/SOURCES.md` | Every link, grouped, with trust levels | No |
| `planning/BUILD_TEAM_AND_STACK.md` | Dev-time checking agents and the open-source stack, options weighed | No |
| `mockups/` | The six approved-direction screens | No |
| `MASCOTS.md` | Which mascot is which agent, and when each animation plays | No |
| `repo_seed/assets/mascots/` | The mascot art: avatars, expressions, animations | Yes (web app `public/mascots/`) |
| `repo_seed/` | Files to copy into the repo root as-is | Yes |
| `repo_seed/CLAUDE.md` | Organizers' rules. Must stay at the repo root, never in `docs/` | Yes |
| `repo_seed/kb/` | Knowledge base: our short notes on each source, with links | Yes |
| `repo_seed/prompts/` | One prompt file per agent | Yes |
| `repo_seed/templates/` | Output templates the agents fill in | Yes |
| `repo_seed/evals/` | Trick prompts that test our guardrails | Yes |
| `repo_seed/config.yaml` | Model name, gate targets, length caps | Yes |

## Build order (tonight)

1. **4:30–5:00 PM.** Copy `repo_seed/` into the repo. Add README with the 8 required headings, MIT LICENSE, `docker-compose.yml`, `.env.example`, `outputs/`, `tests/`. Write the first tests. They fail.
2. **5:00–6:30 PM.** `llm.py` (prompt + Pydantic schema in, checked JSON out, 3 retries), `log.py`, Profiler, co-founder.
3. **6:30–7:30 PM.** Research intern and boss, `slop_check.py`, Phase 1 gate.
4. **7:30–8:30 PM.** UI starts only after Bedo approves the mockups (`planning/UI_INSPIRATION.md`, `planning/DEV_PRACTICES.md` section 3). Body text 18px or larger, nothing under 16px. Approve/reject screen with the no-bare-yes rule. Phase 2 Lean Canvas and its target check, which says stop on a weak idea.
5. **8:30–9:30 PM.** Run two founder briefs, one strong and one weak. Commit the real outputs and the log. Write ARCHITECTURE.md and README. All tests pass.
6. **9:30–10:00 PM.** Freeze. Run `docker compose up` on a clean machine.
7. **10:00–11:30 PM.** Judges panel, shark panel, daily check-in, mascots. Anything unfinished gets labelled `STUBBED`.

## First tests to write

1. The gate says stop at 12 of 100 sign-ups.
2. Nothing is published without an approval record.
3. A bare "yes" is rejected as an approval. So is an approval with no option picked.
4. The boss rejects a draft with banned phrases or a reading grade above 8.
5. Every `decision_log.json` entry has `timestamp, agent, action, sources, model, cost, approved_by`, plus our own `founder_input`.
6. Each trick prompt in `evals/trick_prompts.md` is refused.
7. An action with no `founder_input` does not run.

## Kickoff prompt (paste this first)

> Read START_HERE.md, then CLAUDE.md in repo_seed/, then everything in planning/. Install the skills in planning/SKILLS_TO_INSTALL.md. Use superpowers brainstorming, then writing-plans, to turn planning/FOUNDER_LOOP.md into a task list for the build order in START_HERE.md. Write tests before code, starting with the tests listed in START_HERE.md. Copy repo_seed/ into the repo root. Payments are mocked only, no sandbox. Default model: gpt-oss:20b through Ollama, fallback qwen3:8b. Everything in outputs/ and decision_log.json must come from a real run. Label every stub STUBBED or MOCKED in the README table and in the app. All writing follows prompts/house_voice.md. For any UI work, use the impeccable skill, follow planning/UI_INSPIRATION.md and the mockups in mockups/, and build on Next.js + shadcn/ui + assistant-ui with a FastAPI backend (planning/BUILD_TEAM_AND_STACK.md). Run the best-practice auditor, simplicity guard, and security reviewer on every task. Ask me before anything that can't be undone.
