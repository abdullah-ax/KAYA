# Open-source projects to borrow from

Take patterns and text with credit. Don't adopt a whole framework. Check each license before copying, and list every borrowed piece in `CREDITS.md`.

## Entrepreneurship, close to our product

| Project | License | What to take |
|---|---|---|
| [VentureNode](https://venture-node.vercel.app) | open source | Closest to our plan: six agents in a state machine, founder approval checkpoints, free stack |
| [emotixco/claude-skills-founder](https://github.com/emotixco/claude-skills-founder) | MIT | 7-dimension idea scorecard, Mom Test interview script, competitor matrix |
| [mfwarren/entrepreneur-claude-skills](https://github.com/mfwarren/entrepreneur-claude-skills) | MIT | 24 founder skills, market research |
| [phuryn/pm-skills](https://github.com/phuryn/pm-skills) | MIT | Market sizing, startup canvas, business model |
| [alirezarezvani/claude-skills](https://github.com/alirezarezvani/claude-skills) | check | Solo-founder persona; "office hours" YC-style founder grilling; stress test |
| [MaxKmet/idea-validation-agents](https://github.com/MaxKmet/idea-validation-agents) | check | AGENTS.md routing; "to build or not to build" verdict |
| [ferdinandobons/startup-skill](https://www.sourcepulse.org/projects/28659750) | check | 8 phases, 30+ deliverables. Use to check our templates for gaps |
| [MSVA](https://app.readytensor.ai/publications/multi-agent-startup-validation-assistant-msva-a-modular-orchestrated-system-for-startup-idea-eval-ZWQlAFvQAKSK) | check | Simple folder layout: `agents/`, `orchestration/`, `tools/` |

## AI co-founder repos to steal from

| Project | License | What to take |
|---|---|---|
| [shawnpang/startup-founder-skills](https://www.sourcepulse.org/projects/32200622) | check (each skill credits its source) | 50 founder skills across fundraising, sales, product, legal, finance, growth |
| [AIDevGTM/gtm-cofounder](https://trendshift.io/repositories/94988) | MIT | Interviews the founder once, then walks them through positioning, first 50 users, launch, pricing. Closest to our "co-founder that asks first" idea |
| [openclaw/skills founder-coach](https://aiagentsdirectory.com/skills/openclaw-openclaw-skills-aiwithabidifounder-coach-ai) | check | Daily decision journal, accountability tracking, weekly strategy review. Use for our daily check-in and `decisions.md` |
| [acnlabs/OpenPersona entrepreneur-skill](https://openskillindex.com/skills/acnlabs-openpersona-entrepreneur-skill) | check | Founder-partner persona kept in one `persona.json`, plus a weekly review script. Good pattern for our co-founder types |
| [Shotgun AI Cofounder Framework](https://www.producthunt.com/posts/shotgun-ai-cofounder-framework) | open source | Persistent, personalized co-founder that keeps context across sessions |
| [prateekjain/ChiefOfStaff](https://sharedcontext.ai/plugins/external/prateekjain/chiefofstaff) | check | Chief-of-staff agent that picks specialist agents by venture type |
| [DigitalProductschool/AgenticAICoach](https://awesome.ecosyste.ms/projects/github.com%2FDigitalProductschool%2FAgenticAICoach) | check | Founder-journey milestones (uses CrewAI; take the content, not the framework) |
| [alirezarezvani/claude-skills solo-founder](https://openskillindex.com/skills/alirezarezvani-claude-skills-solo-founder) | check | "Your co-founder who doesn't exist yet" persona text |

## Agent structure

| Project | License | What to take |
|---|---|---|
| [12-Factor Agents](https://github.com/humanlayer/12-factor-agents) | Apache-2.0 / CC BY-SA 4.0 | Own your prompts, context, and control flow. Humans contacted through a tool call. Small agents |
| Grok Bot pattern (Founder Mode pack) | closed, pattern only | One chief of staff with specialist bots ([xAI guide](https://x.ai/bot/guides/grok-bot-for-founder-led-sales)). Our co-founder is the chief of staff |
| [Rakazo](https://github.com/elie222/rakazo) | Apache-2.0 | Open Grok Bot alternative. Too big to adopt; read for the roster idea only |

## Voice

| Project | License | What to take |
|---|---|---|
| faster-whisper | MIT | Main speech-to-text, local ([guide](https://dev.to/xadenai/building-a-local-voice-ai-stack-whisper-ollama-kokoro-tts-on-apple-silicon-eo0)) |
| [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) | Apache-2.0 | Main text-to-speech, local, runs on CPU |
| Browser `speechSynthesis` | built in | Fallback voice only ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API/Using_the_Web_Speech_API)) |
| [huggingface/speech-to-speech](https://github.com/huggingface/speech-to-speech) | check | Reference pipeline: voice activity detection, speech to text, model, text to speech |

## Writing and visual quality

| Project | License | What to take |
|---|---|---|
| [stop-slop](https://github.com/hardikpandya/stop-slop) | check | Phrase and structure lists for `slop_check.py` |
| [humanizer](https://github.com/blader/humanizer) | MIT | Rewrite pass for the intern |
| [impeccable](https://github.com/pbakaus/impeccable) | Apache-2.0 | UI rules and `npx impeccable detect` |

## Dev process

| Project | License | What to take |
|---|---|---|
| [superpowers](https://github.com/obra/superpowers) | MIT | Brainstorm, plan, test first, review |
| [ECC](https://github.com/affaan-m/ECC) | MIT | Planner, code reviewer, and security agents |
