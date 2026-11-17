# Build team and stack

Two parts: the agents that check our work while we build, and the open-source stack we build on. Rule for every choice: reuse a proven open-source piece, compare 2–3 options in a short table, pick the simplest one that works.

## 1. Agents that check the build (dev time, not in the product)

| Agent | Job | Built from |
|---|---|---|
| **Best-practice auditor** (adversarial) | Reviews every task against the rules in `DEV_PRACTICES.md` (Anthropic agent patterns, 12-Factor Agents, structured outputs). Tries to break it. Must name a concrete failure, not a style opinion | ECC code-reviewer and architect agents; `superpowers:requesting-code-review` |
| **Simplicity guard** | Blocks over-engineering. Every new dependency, file, or abstraction needs one written line on why. Asks "what if we deleted this?" | superpowers YAGNI rule; our rule below |
| **Security reviewer** | Secrets, prompt injection from web content, unsafe file paths, approval bypass | ECC security-reviewer agent |
| **Bug fixer** | Reproduce, find the cause, fix, add a test | `superpowers:systematic-debugging`; ECC build-error-resolver |
| **Skill scout** | Before a new kind of task, finds the best existing skill or repo and compares 2–3 | skills registries (skills.sh, ECC catalog), `OPEN_SOURCE_TO_BORROW.md` |

Order for each task: build → auditor → simplicity guard → security reviewer (for anything touching input, files, or approvals) → merge.

Simplicity rules:

- No new framework when 50 lines of plain code will do.
- No abstraction until the third time we need it.
- No feature that no user story asks for.
- One decision record per real choice: `docs/decisions/NNN-title.md` with options, pick, and why. Keep each under 15 lines.

Sources: [superpowers](https://github.com/obra/superpowers), [ECC](https://github.com/affaan-m/ECC), [Anthropic: Building effective agents](https://www.anthropic.com/engineering/building-effective-agents).

## 2. The stack: options weighed

### UI

| Option | Fit with the mockups | Speed tonight | Risk |
|---|---|---|---|
| **A. Next.js + shadcn/ui + assistant-ui** (recommended) | High. assistant-ui gives chat, streaming, auto-scroll, attachments, and voice dictation out of the box, on shadcn/ui and Tailwind | Medium. The CLI scaffolds a working chat app | Two languages (TypeScript front, Python back) |
| B. Streamlit only | Low. Hard to match the three-panel layout and large type | Fast | Looks generic; voice is awkward |
| C. Fork Rakazo | High. Closest open copy of the Grok Bot layout: roster sidebar, chat, right panel | Slow. Big codebase to learn tonight | May not fit our Python agents |

assistant-ui facts: MIT license, a TypeScript/React library for AI chat, works with custom backends ([npm](https://www.npmjs.com/package/@assistant-ui/react), [license and backends](https://packages.ecosyste.ms/registries/npmjs.org/packages/@assistant-ui%2Freact), [features incl. voice dictation](https://bestofjs.org/projects/assistant-ui)). Start with `npx assistant-ui create`. Check how its voice dictation plugs into our own faster-whisper endpoint before relying on it.

### Layout inspiration (Grok Bot pattern)

| Project | License | What to take |
|---|---|---|
| [Rakazo](https://github.com/elie222/rakazo) | Apache-2.0 | Roster sidebar, central chat, right panel with the bot's work |
| [OpenBot (CopilotKit)](https://github.com/CopilotKit/OpenBot) | MIT | Slack-style sidebar of coworkers and threads |
| [OpenMausBot](https://github.com/milind-soni/OpenMausBot) | Apache-2.0 | Chat list where each chat is a bot |

Source for this comparison: [Bitdoze: open-source Grok Bot alternatives](https://www.bitdoze.com/md/best-open-source-grok-bot-alternatives.md). It doesn't document Grok Bot's exact screens, so we copy the pattern, not the look.

### Backend and AI

| Part | Pick | Why |
|---|---|---|
| API | FastAPI (Python) | Our agents, Pydantic schemas, and voice libraries are Python |
| Model | Ollama: `gpt-oss:20b`, fallback `qwen3:8b` | Free, local, structured outputs |
| Schemas | Pydantic | Checked JSON from every model call |
| Storage | Files per founder run (`founder_profile.json`, `decisions.md`, `notes.md`, `run_state.json`) + SQLite for search | Nothing to set up; easy for judges to read |
| Search | SearXNG container | Free, no key |
| Voice | faster-whisper (MIT) + Kokoro-82M (Apache-2.0) | Open source, runs on CPU |
| Tests | pytest (backend), Playwright smoke test (one screen) | Standard names the checker finds |

### docker-compose services

`web` (Next.js), `api` (FastAPI + agents + voice), `ollama`, `searxng`. One command: `docker compose up`.

## 3. UI rules from the approved direction

- Grok Bot layout: team roster left, one chat per agent center, working panel right.
- One font (Public Sans), bold for hierarchy. Four sizes: 16, 20, 24, 32 (48 for the one big question per screen). Nothing under 16px.
- One accent green (#1E5A3C), one red (#9B2C1F) for fails and STOP. Ink #111111 on #FAFAF7.
- Mockups: `mockups/` in this pack and the shared canvas. No UI code before Bedo approves them.
