# Contributing

Boardroom is MIT licensed. Bugs and ideas go in GitHub Issues. Maintainers are listed in [MAINTAINERS.md](MAINTAINERS.md).

## Set up

```bash
pip install -r requirements-dev.txt
python3 -m pytest -q tests
cd web && npm install && npx vitest run
```

`docker compose up` runs the whole app at http://localhost:3000. With it running, this runs the pipeline in the terminal:

```bash
OLLAMA_URL=http://localhost:11434 SEARXNG_URL=http://localhost:8080 python3 -m api.cli --brief briefs/strong.md
```

## Where things live

| You want to change | Look in |
|---|---|
| What an agent says | `prompts/` (plain markdown), called from `api/agents/` |
| The order of steps | `api/orchestrator.py` |
| A gate rule or target | `api/gates.py` and `config.yaml` |
| Founder approval | `api/approval.py` |
| What the system refuses | `api/guardrail.py`, `api/ethics.py`, `evals/trick_prompts.md` |
| The knowledge base | `kb/`, one claim per line, each with a source link or the word `ASSUMPTION` |
| The web app | `web/src/` |

## Rules for every change

1. Start with a failing test. A pull request needs `python3 -m pytest -q tests`, `cd web && npx vitest run` and `python3 scripts/precheck.py` to pass.
2. Never edit `outputs/` or `decision_log.json` by hand. They come from a real run only.
3. Mark a step Working in the README only after a real run proves it. Label every mock `MOCKED` and every stub `STUBBED`.
4. Nothing is published, sent, spent or signed without founder approval in code. A bare "yes" never counts.
5. Every claim has a source link or the label `ASSUMPTION`.
6. Writing follows `prompts/house_voice.md`: short words, numbers over adjectives, no hype.
7. No secrets in git. Real keys go in an untracked `.env`.
8. Commits follow conventional commits (`feat:`, `fix:`, `test:`, `docs:`), small and focused.

## Good first changes

- Add a trick prompt: one row in `evals/trick_prompts.md`. The guardrail test runs every row.
- Add a knowledge note in `kb/` with its source.
- Make one sentence in a prompt shorter or plainer, then run the tests.

## What we will not merge

Anything that promises income, fakes reviews or sign-ups, poses as a person or a brand, moves real money, or puts a core feature behind a paywall. The full list is in the README under "What our system will NOT do".
