# Team rules for Claude Code

The organizers' rules are in `CLAUDE.md` above and always win. These are ours on top.

## Every push to main is graded

1. Work on a branch. Merge to `main` only at a checkpoint (`planning/HANDOFF_PLAN.md`).
2. Before any merge or push to main: `python3 scripts/precheck.py` shows 0 errors and `python3 -m pytest -q tests` passes. The pre-push hook (`sh scripts/install_hooks.sh`) enforces this.
3. Never write `outputs/` or `decision_log.json` by hand. They come from a real run only.
4. The README status table and ARCHITECTURE.md "Built vs. stubbed" change only after a real run proves a step works. Never mark a mock or stub as Working.
5. Keep README short; the most important facts go first.

## Build rules

- Read `planning/START_HERE.md`, `planning/FOUNDER_LOOP.md`, `planning/DEV_PRACTICES.md`, `planning/BUILD_TEAM_AND_STACK.md`, and `planning/MASCOTS.md` before building.
- Plain Python workflow, small agents, Pydantic-checked JSON from Ollama, our code owns the loop.
- Founder approval in code: no bare "yes", an option and a 15+ word reason, no action without `founder_input`.
- Every claim has a source URL or `ASSUMPTION`; every source gets a source card.
- All writing follows `prompts/house_voice.md` and passes `slop_check.py`.
- UI follows the approved mockups in `planning/mockups/`: one font, sizes 16/20/24/32/48, Grok Bot layout, living mascots.
- Run the best-practice auditor, simplicity guard, and security reviewer on each task.
