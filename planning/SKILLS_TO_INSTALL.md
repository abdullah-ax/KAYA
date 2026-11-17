# Skills and plugins to install

Install these in the hackathon Claude Code session before building. Check each license before copying files into the repo, and credit them in `CREDITS.md`.

## For building (dev tools, not shipped)

| What | Command | Why |
|---|---|---|
| superpowers | `/plugin install superpowers@claude-plugins-official` (or `/plugin marketplace add obra/superpowers-marketplace` then `/plugin install superpowers@superpowers-marketplace`) | Brainstorm, plan, test first, review |
| ECC (core profile) | `npx ecc-install --profile core` | Planner, code reviewer, security reviewer agents |
| impeccable | `npx skills add pbakaus/impeccable` | UI build, critique, polish, audit, `detect` |
| stop-slop | `npx skills add https://github.com/hardikpandya/stop-slop --skill stop-slop` | Checks our own docs and README |

Sources: [superpowers](https://github.com/obra/superpowers), [ECC](https://github.com/affaan-m/ECC), [impeccable](https://github.com/pbakaus/impeccable), [stop-slop](https://github.com/hardikpandya/stop-slop).

## For the product (read, then turn into our prompts and templates)

These are SKILL.md files: plain markdown. Do not run them as Claude skills inside the product. Read them and copy the useful parts into `prompts/` and `templates/`, with credit.

| Repo | License | Take |
|---|---|---|
| [emotixco/claude-skills-founder](https://github.com/emotixco/claude-skills-founder) | MIT | `/validate-idea` scorecard, `/user-interviews` Mom Test script, `/competitor-matrix` |
| [phuryn/pm-skills](https://github.com/phuryn/pm-skills) | MIT | `market-sizing`, `startup-canvas`, `business-model` |
| [mfwarren/entrepreneur-claude-skills](https://github.com/mfwarren/entrepreneur-claude-skills) | MIT | `market-research` |
| [alirezarezvani/claude-skills](https://github.com/alirezarezvani/claude-skills) | check | `solo-founder` persona, `office-hours` 6-question founder grilling, `stress-test` |
| [MaxKmet/idea-validation-agents](https://github.com/MaxKmet/idea-validation-agents) | check | AGENTS.md routing, "to build or not to build" verdict |
| [blader/humanizer](https://github.com/blader/humanizer) | MIT | Rewrite pass for the intern |
| [hardikpandya/stop-slop](https://github.com/hardikpandya/stop-slop) | check | `phrases.md`, `structures.md` → `slop_check.py` |
| [humanlayer/12-factor-agents](https://github.com/humanlayer/12-factor-agents) | Apache-2.0 code, CC BY-SA 4.0 text | Design rules for our loop |

## Local model

```bash
ollama pull gpt-oss:20b      # default; needs about 16 GB of memory
ollama pull qwen3:8b         # fallback for smaller machines
ollama pull nomic-embed-text # only if we add meaning-based search
```

Sources: [Run gpt-oss locally with Ollama](https://developers.openai.com/cookbook/articles/gpt-oss/run-locally-ollama), [Ollama tool calling](https://docs.ollama.com/capabilities/tool-calling).

## Voice (open source)

```bash
pip install faster-whisper   # MIT; speech to text, Arabic and English
pip install kokoro-onnx      # Apache-2.0 weights; text to speech; check the package license too
```

Run both inside the app container or as one small `voice` service in docker-compose. Sources: [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M/blob/main/README.md?code=true), [local voice stack guide](https://dev.to/xadenai/building-a-local-voice-ai-stack-whisper-ollama-kokoro-tts-on-apple-silicon-eo0).

## UI references for the agent

Mobbin offers an MCP connection that lets Claude Code look up real app screens. Free accounts get limited access. Source: [Mobbin](https://mobbin.com/index.md).
