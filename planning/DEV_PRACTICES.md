# How we build

Short version: plain Python, a fixed workflow, tests first, small commits, and a separate loop for UI.

## 1. The coding loop (superpowers + ECC)

Run this loop for every feature.

1. **Brainstorm** (`superpowers:brainstorming`). Ask questions until the feature is clear. Save a short spec.
2. **Plan** (`superpowers:writing-plans`). Break the spec into tasks of 2–5 minutes each. Each task names the test that proves it works.
3. **Test first** (`superpowers:test-driven-development`). Write the test. Watch it fail. Write the least code that passes. Clean up.
4. **Review** (`superpowers:requesting-code-review`, or ECC's code-reviewer and security-reviewer agents). Fix what they find.
5. **Verify** (`superpowers:verification-before-completion`). Run the tests and the app. Never say "done" without proof.
6. **Commit** to `main` with a short message. Push often. The checker only reads `main`.

When something breaks, use `superpowers:systematic-debugging`: reproduce, find the cause, then fix.

Sources: [superpowers](https://github.com/obra/superpowers), [ECC](https://github.com/affaan-m/ECC).

## 2. Agent design rules

| Rule | Why | Source |
|---|---|---|
| Plain Python. No LangGraph, CrewAI, or AutoGen | Teams that succeed use simple patterns, not big frameworks | [Anthropic: Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) |
| Fixed workflow. Code decides the order of steps | Easy to test, easy to explain, hard to break | Same |
| Our code owns the loop: stop rules, retries, approvals, limits | A model that runs its own loop can run away | [12-Factor Agents](https://github.com/humanlayer/12-factor-agents) |
| On error: show the error to the model, retry up to 3 times, then ask the founder | Fixes small slips without endless loops | Same |
| Every model reply is JSON checked by a Pydantic schema. Use Ollama `format=Schema.model_json_schema()` and `temperature=0` | Bad output is caught at once | [Ollama structured outputs](https://docs.ollama.com/capabilities/structured-outputs) |
| One `run_state.json` per run | A run can pause for founder approval and resume | 12-Factor Agents |
| Small agents, one job each | Easier prompts, easier tests | Same |
| Judges vote pass or fail per point, with one line of reason. No 1–10 scores | Pass/fail is more consistent | [LLM-as-judge guide](https://tianpan.co/blog/2025-10-04-llm-as-judge-evaluation) |
| A failed step shows as failed | We never invent output to fill a gap | Hackathon rules |

### The one LLM function

Everything goes through one function. That keeps retries, logging, and cost in one place.

```python
def ask(agent: str, prompt: str, schema: type[BaseModel], founder_input: str, sources: list[str]) -> BaseModel:
    # 1. call Ollama with format=schema.model_json_schema(), temperature=0
    # 2. validate with schema.model_validate_json()
    # 3. on failure: append the error to the prompt, retry, max 3
    # 4. append one entry to decision_log.json (all required keys + founder_input)
    # 5. raise StepFailed after 3 failures; the UI shows it as failed
```

### What stays loose

- Prompts and templates are markdown files. Changing them needs no code.
- Templates require only sources and assumptions. Everything else is free text.
- Gate targets live in `config.yaml`. The founder sets them before a run, never after seeing results.

## 3. The UI loop (impeccable)

**Gate: no UI code until Bedo approves the mockups.** Show the inspiration board and one mockup per screen first. Get a written yes per screen with a reason.

Skills to use for UI, in order: `impeccable` (shape, craft, critique, polish, audit), `frontend-design`, `design:design-critique`, `design:accessibility-review`. Hard rule: body text 18px or larger, nothing on screen below 16px, headings 32px or larger.

1. **Look first.** Open 3–5 real products from `planning/UI_INSPIRATION.md`. Write down what to copy and why.
2. **Set up.** Run impeccable's setup. It asks for `PRODUCT.md` (who uses it, what it's for) and builds `DESIGN.md` (colors, type, spacing).
3. **Mock before code.** Make one rough screen per step: intake, co-founder chat, gate, judges' notes, shark panel.
4. **Build** with `impeccable craft` or `shape`.
5. **Critique and polish** with `impeccable critique`, then `polish`.
6. **Audit** with `impeccable audit` for contrast, keyboard use, and empty states.
7. **Detect** with `npx impeccable detect` on every HTML page and deck. Fix every AI tell it finds.

Rules that matter most for us: large readable text, body contrast at least 4.5:1, no purple-blue gradients, no frosted glass, no card grids by default, real motion only where it explains something. Source: [impeccable](https://github.com/pbakaus/impeccable).

## 4. Writing rules

- Every output passes `slop_check.py`: banned phrases (from [stop-slop](https://github.com/hardikpandya/stop-slop) and [Wikipedia: Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing)), em-dash count, lists of three used as filler, and reading grade 8 or below with `textstat`.
- The boss rejects anything that fails. Two rejections and it goes to the founder with notes.

## 5. Knowledge base and retrieval

- `kb/` holds our short notes, each with its source link at the top.
- Tonight: `kb/INDEX.md` plus keyword search (SQLite FTS5). Add meaning-based search (`sqlite-vec` + `nomic-embed-text`) only if time allows.
- Every retrieved note passes its URL into the output and into `sources` in the log.
- Optional upgrade: add 1–2 sentences of context to each chunk before indexing. Anthropic reports this cut failed lookups by 35%, and by 49% with keyword search added. Source: [Anthropic contextual retrieval](https://platform.claude.com/cookbook/capabilities-contextual-embeddings-guide).

## 6. Before every push

- Tests pass.
- README has all 8 headings in order. Quickstart shows `docker compose up`. Cost per run has a `$` figure.
- Every mock is labelled `MOCKED` or `STUBBED` in the README table and in the app.
- No secrets. `.env` is in `.gitignore`.
- `outputs/` and `decision_log.json` came from a real run.
