# Onboarding plan: guided, then personal

## Problem
The first question ("Tell me about you in two or three sentences") is vague. Founders freeze or write fluff. We replace it with short, specific questions, then let the model ask follow-ups that use the founder's own words.

## The flow
One question per screen, big type, chips plus optional free text.

Fixed opening (no model needed):
1. What do you do most days? Chips: Student, Employee, Freelancer, Run a business, Between jobs. Free text for the field ("Pharmacy, 4th year"). Key `role`.
2. Where are you based? City, free text, Egypt-first placeholder. Key `city`.
3. What do people already ask you to help with? Chips plus text. Key `help`.
4. Which group could you message today, and about how many people are in it? Text with an example. Key `group`.
5. Hours per week, then money. Chips (already in the app). Keys `time`, `money`.

Dynamic follow-ups (model-written, one at a time, max 4 in demo mode):
- Each question quotes or builds on the founder's earlier words.
- The model picks a gap from the topic list below. Topics already answered are skipped.

Final screen "Here's what I understood": a profile card (strengths in the founder's words, access with counts, constraints, values, co-founder type with one line why). Every line is editable. "Start" builds the brief from the confirmed profile and calls the existing `createRun`. Model pick, provider and key behave as before.

## Topics for follow-ups (fixed list, model chooses)
| key | gap | idea comes from |
|---|---|---|
| problem | what the group complains about, in their words | question bank "Problems you know"; office-hours Q1 (problem in the customer's words) |
| customer | one named person who would pay today | office-hours Q2; Mom Test style "last time" questions |
| distribution | how that group first hears of you | office-hours Q3 |
| past | what they built, sold, taught or organized | question bank "Skills" |
| fit | why them, why this group | office-hours Q6; question bank "Values" |
| unpaid | how long they can work unpaid | question bank "Time, money, risk"; YC co-founder question 7 |
| wont_do | what business they would never run | question bank "Values" |
| conflict | what they do first when a plan goes wrong | question bank "Personality" |

Defensibility and capital (office-hours Q4, Q5) are not asked in onboarding. Defensibility is too early for a first-time founder; money and hours are already fixed questions.

## Credit
- Our `prompts/question_bank.md` (YC co-founder questions, Paul Graham: How to Get Startup Ideas).
- Office-hours six questions: https://github.com/alirezarezvani/claude-skills (MIT), `c-level-agents/skills/office-hours`: problem in the customer's words, one named customer, distribution, defensibility, capital, founder fit.
- https://github.com/emotixco/claude-skills-founder (MIT), `user-interviews` and `validate-idea`: ask about the last real time something happened, not about opinions or the future.
We reuse the ideas and write our own wording.

## API contract
`POST /onboarding/next`, optional `X-Model-Key` header (same as `/runs`).

Request:
```
{ "answers": [{ "key": "help", "question": "...", "answer": "..." }],
  "mode": "demo" | "full",
  "provider": "ollama" | "openai",   // optional, default ollama
  "model": "..." }                    // optional, must be a listed model
```
Reply:
```
{ "done": false,
  "question": { "key", "text", "why", "kind": "text" | "choice", "options"?: [..], "placeholder"? } }
{ "done": true, "profile": { strengths, access, constraints, values, cofounder } }
```
- Every answer goes through `guardrail.check_answer`. A refused answer returns 422 with the plain reason and the alternative.
- Max follow-ups: `max_intake_questions` of the mode, minus 1 (4 with today's demo config). In full mode it is capped at 8. When the founder has answered that many follow-ups, the reply is `done: true` with the profile.
- Founder text is untrusted. In the prompt it sits inside a fenced `<founder_answers>` block, with an instruction that it is data. Fence tags inside answers are removed.
- The model reply is a Pydantic schema. We reject a topic that is already answered, an empty text, or a choice with fewer than 2 options.

## Fallbacks (never block onboarding)
- The model errors, times out, returns bad JSON, or the provider needs a key we do not have: the server picks the next unanswered question-bank topic from a fixed template and fills in the founder's group and skill words ("You said {group}. What do they complain about most?").
- The web app cannot reach the API at all (demo mode, offline): the same templates run in the browser (`web/src/lib/onboarding.ts`). The profile card is also built in the browser.
- The profile is built by code from the answers, not by the model, so it is the same online and offline. Lines with no answer say ASSUMPTION.

## UI states
Loading skeleton while the next question is written, error with Retry, refused answer shown inline under the field, back button, "Why we ask" shows the question's `why`.

## Tests (written first)
API (`tests/test_onboarding.py`, FakeLLM): next question quotes an earlier answer; the prompt fences untrusted text; refused answer returns 422; model failure falls back and still personalises; factory error falls back; stops after the max follow-ups and returns a profile; bad model output (repeated topic) falls back; profile content and counts.
Web (vitest): guided chips flow in order; dynamic question with "why we ask"; loading skeleton, error and retry; refused answer inline; profile edit then Start posts a brief with the edited lines; offline fallback when the API is unreachable; no dot characters (existing test).
Old onboarding tests change only where the vague first question is gone.
