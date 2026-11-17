# The founder loop: what the product does

This is the product spec. Build it in the order of section 1.

## 1. Minimum acceptable scope (MVP by 10 PM)

**Must work for real:**

1. Founder brief in. Profiler asks only about gaps (5 questions in demo mode). Writes `founder_profile.json`.
2. Co-founder type picked from the profile (section 3). It leads the chat.
3. Voice: talk to the co-founder, brain-dump, and hear it answer, using open-source local models (section 6). Typing always works too.
4. Notes panel: every founder answer, decision, and voice note is saved and shown (section 7).
5. Phase 1 Discover: research intern drafts 2–3 opportunities with sources; boss checks; founder picks one and says why.
6. Phase 1 gate and Phase 2 gate (Lean Canvas + a sign-up target set in advance). A weak idea ends in **stop**.
7. No-bare-yes approvals, `decision_log.json`, `slop_check.py`, guardrail refusals.
8. Ethics bot: checks every request, draft, and gate for deception, manipulative design, and privacy problems. Verdicts: pass, fix, or block (`prompts/ethics_bot.md`, `kb/ethics/ethics_framework.md`).

**Labelled `STUBBED` tonight (designed in ARCHITECTURE.md, simple output only):**

- Phases 3–6 (build, pricing and policies, launch with `MOCKED` delivery, operate).
- Judges panel: one combined judge in the MVP, four judges later.
- Shark panel (section 5) and daily check-in (section 4), if not done by 11 PM.

**Not in scope:** accounts, logins, real payments, real posting, emails, a hosted version.

## 2. The no-lazy-founder rules

The co-founder suggests and organizes. The founder decides.

- Every step ends with the founder choosing between 2–3 options. Each option shows cost, risk, and a source.
- The founder explains the choice in 15+ words. "Yes", "ok", "sure", and "looks good" are rejected.
- Before approving a draft, the founder answers 2 short questions about it. Wrong answers get a plain explanation with a source, then the questions again.
- Each action in the log stores `founder_input`: the founder's words that led to it. No founder input, no action. The agent asks a question instead.
- The co-founder organizes the founder's thinking back to them: "You said X on Monday and Y today. Which one holds?"

## 3. Co-founder types

The Profiler's personality answers pick one type. Inspired by investor styles, no real names.

| Founder seems… | Type | Sounds like |
|---|---|---|
| Too hopeful | Numbers Hawk | "What's the profit on each sale? Who pays?" |
| Plans too much | Hustler | "Ship it today. Talk to ten people by Friday." |
| Only cares about the product | Brand Builder | Story, name, how people will find it |
| All over the place | Operator | "One thing at a time. What's first?" |
| Worried or doubtful | Warm Skeptic | Encouraging, but always asks the one hard question |

The type changes tone and what it teaches. Never facts, sources, or gate results.

## 4. Daily check-in and daily lesson

Why: YC says founders told them the weekly pressure to launch was one of Startup School's biggest benefits ([YC blog](https://blog.ycombinator.com/announcing-startup-school-winter-2020)).

Each day the founder opens the app:

1. **3 questions** (`templates/daily_checkin.md`): How many users or customers did you talk to yesterday, and what did you learn? What is the one thing you'll finish today? What are you avoiding, and why?
2. **One lesson** under 20 minutes, picked by the co-founder for the founder's weak spot, from `kb/lessons/daily_lessons.md`. Always a link to the real source.
3. **One action** tied to the lesson, due today.

No streak pressure, no countdown timers. The rules ban fake urgency.

## 5. Shark panel (end of Phase 2 and before launch)

Five investor types review the founder's evidence and pitch. Each one says **in** or **out**, the reason, and what proof would change their mind. Built from public descriptions of real investor styles (`kb/investors/shark_archetypes.md`), with no real names.

- This is practice feedback, not investment. Label it `SIMULATION`. No money, no offers, no success promises.
- Each shark has **entry signals** (what makes them lean in) and **exit triggers** (what makes them say "I'm out").
- Output: `outputs/phase2_step3_shark_panel.md`, using `templates/shark_verdict.md`.

## 6. Voice (open source, local)

Voice must be open source, so the main path runs locally in docker-compose.

| Part | Pick | License | Note |
|---|---|---|---|
| Speech to text | `faster-whisper` (small model, CPU is fine) | MIT | Handles Arabic and English |
| Text to speech | Kokoro-82M | Apache-2.0 | Runs faster than real time on a normal CPU. No Arabic voice: speak English, show Arabic as text |
| Fallback text to speech | Browser `speechSynthesis` | browser built-in, runs locally | Use only if Kokoro won't start |

Do not use Chrome's `webkitSpeechRecognition` as the main path: it is not open source and may send audio to Google's servers.

Sources: [Kokoro-82M model card](https://huggingface.co/hexgrad/Kokoro-82M/blob/main/README.md?code=true), [Kokoro languages and license](https://tts.ai/voices/kokoro/), [Kokoro on CPU](https://localaimaster.com/blog/kokoro-tts-local-setup), [local stack: Whisper + Ollama + Kokoro](https://dev.to/xadenai/building-a-local-voice-ai-stack-whisper-ollama-kokoro-tts-on-apple-silicon-eo0), [browser recognition may use remote servers](https://senoritadeveloper.medium.com/in-browser-speech-to-text-using-the-web-speech-api-7cc67a989406), [Piper is archived](https://bestllmfor.com/guide/kokoro-tts-voix-locale/).

Voice rules:

- Push-to-talk button. No always-on mic.
- Show the transcript before sending so the founder can fix it.
- The co-founder speaks short answers only. Long content stays on screen.

### Brain dump mode

The founder holds the button and talks for as long as they want. Then:

1. The transcript is saved as-is to `notes.md` with a timestamp. Nothing is lost.
2. The co-founder sorts it into: problems, people, ideas, worries, facts with numbers, and open questions. Each item quotes the founder's words.
3. It asks 1–3 follow-up questions about the most important gaps, one at a time.
4. The founder confirms or fixes the sorting. Only then does it update `founder_profile.json` or `decisions.md`.

### Proactive, not pushy

The co-founder starts conversations, but the founder makes the calls.

- When the founder opens the app: the daily check-in (section 4), then "Here's where we left off" in 3 lines from `run_state.json`.
- After each gate: suggests the next step and one action due today.
- When an open question has waited 2+ days, it asks about it once.
- It never acts on its own. Suggestions only, until the founder picks and explains.

## 7. Context: never lose the founder's thinking

The framework is Anthropic's context engineering: keep the smallest set of useful tokens, write notes outside the model, and summarize at checkpoints ([Anthropic: Effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)). It needs no framework, just files.

**Files that hold the memory (one folder per founder run):**

| File | Holds | Written by |
|---|---|---|
| `founder_profile.json` | Who the founder is: skills, network, money, time, values, personality, co-founder type | Profiler, updated when the founder corrects it |
| `decisions.md` | Each decision: date, step, options shown, option picked, the founder's own reason | Gate code |
| `notes.md` | Voice notes and typed notes, with timestamps | Notes panel |
| `open_questions.md` | Things the founder hasn't answered yet | Co-founder and judges |
| `run_state.json` | Current phase and step, step summaries, gate results | Orchestrator |

**What each model call sees (in this order):**

1. `prompts/house_voice.md` + the agent's own prompt
2. A short `founder_profile.json`
3. The current step and the summaries of earlier steps from `run_state.json`
4. The last 3 decisions from `decisions.md` and any open questions
5. Only the kb notes this step needs (looked up when needed, not preloaded)
6. The last 6 chat turns

**Summarize at every gate.** After a gate, a summarizer writes 5 lines into `run_state.json`: what was decided, why (in the founder's words), what evidence, what's still open, and what comes next. The raw chat moves to an archive file. That keeps each call small for an 8B–20B local model.

Why this works: compaction plus structured note-taking are the two simplest long-task techniques in Anthropic's guide. Claude Code's to-do list is one example of note-taking ([summary](https://agentic-ai.readthedocs.io/en/latest/ContextEngineering/anthropic/)). 12-Factor Agents calls the same idea "own your context window" ([12-Factor Agents](https://github.com/humanlayer/12-factor-agents)).

## 8. User stories

Before Phase 3, the co-founder walks the founder through 3–5 user stories (`templates/user_stories.md`). The founder writes them. The co-founder only checks them:

- Format: As a [specific person], I want [goal], so that [reason].
- Each story has acceptance criteria: Given [situation], when [action], then [result].
- Check with INVEST: independent, negotiable, valuable, estimable, small, testable.
- Each story links to an interview note or is labelled `ASSUMPTION`.

Sources: [INVEST and Given-When-Then](https://www.smartsheet.com/writing-user-story), [user story template](https://s.visual-paradigm.com/guide/how-to-write-good-user-stories-examples-and-best-practices-for-story-writing/).

## 9. The six phases and their gates

| Phase | Output files | Gate |
|---|---|---|
| 1 Discover | `phase1_step1_founder_profile.md`, `phase1_step2_opportunities.md`, `phase1_step3_interview_script.md` | 3+ sourced problems, founder picks one with a reason |
| 2 Validate | `phase2_step1_lean_canvas.md`, `phase2_step2_landing_page.html`, `phase2_step3_shark_panel.md` | Pre-set target (example: 100 sign-ups in 14 days). Founder enters real numbers. Demo numbers are `MOCKED` |
| 3 Build | `phase3_step1_user_stories.md`, `phase3_step2_mvp_spec.md` | Tests pass |
| 4 Commercial | `phase4_step1_pricing.md`, `phase4_step2_policies.md` ("draft, not legal advice") | Founder approves |
| 5 Launch | `phase5_step1_store_page.html`, `payment_test_log.md` (all `MOCKED`) | Founder approves each post. Each order delivered once. Refund removes access |
| 6 Operate | `phase6_step1_pivot_memo.md` | Founder approves |

Gate files: `phase<N>_gate_<name>.md`. Outcomes: go, repeat, pivot, stop.
