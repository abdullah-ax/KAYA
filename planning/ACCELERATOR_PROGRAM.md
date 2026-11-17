# The accelerator program

Boardroom should coach like a top accelerator: push the founder to think big, talk to users, ship fast, get it in front of people, and show traction or pivot. It works for any founder, not one niche.

## Principles

1. **The founder does the thinking.** Agents ask, organize, and push. They never decide.
2. **Dream big, promise nothing.** Big questions are about how many people the product could help and how far it could go. Never about money the founder will make (that breaks the no-income-promise rule).
3. **Ship and distribute early.** Every stage ends with something real in front of real people within days, not weeks.
4. **Small, digestible learning.** One action today, one resource under 15 minutes, one real case study. Every link checked.
5. **Evidence decides.** Weekly numbers against targets set in advance. Traction moves the founder on; weak numbers mean repeat, pivot, or stop.

## Shape: stages, each run like an accelerator week

Each stage has the same parts, so the founder always knows what to do next.

| Part | What it is | Example (Validation) |
|---|---|---|
| Goal | One sentence | Get proof from strangers before building |
| Coach | The agent who leads, with handoffs | Noor leads; the Hustler joins for outreach |
| Big question | One "think big" prompt | If this worked, who else would want it in a year? |
| Questions | 3 short questions about the founder's own situation, built from their earlier words | Who outside your group have you talked to? |
| Do today | One concrete action, under 2 hours | Message 10 people you don't know and ask about the last time they had this problem |
| Ship | What goes in front of people this week | A sign-up page, published after approval |
| Metric | One number, target set before the test | Sign-ups from strangers in 14 days |
| Learn | One resource under 15 minutes, link checked | The Mom Test (book site), Paul Graham: Do Things That Don't Scale |
| Case study | One real company, sourced | Airbnb going door to door; Stripe's "Collison installation" |
| Review | Gate: go, repeat, pivot, or stop | Under 30% of target recommends stop or pivot |

## Coaches over time

The right agent shows up when the stage needs it.

| Stage | Lead | Joins when needed |
|---|---|---|
| Ideation | Profiler, then the co-founder | Research intern, boss |
| Validation | Co-founder | Hustler (outreach scripts), evidence judge |
| Build | Operator | Boss (scope cuts) |
| Pricing and setup | Numbers hawk | Ethics judge (policies, no dark patterns) |
| Distribution | Hustler | Brand builder (name, message, page), ethics judge |
| Operate and learn | Co-founder | Clarity judge, shark panel (simulation) |

Ahmed Tarek mode (parody, on by default) comments on every stage's numbers and sits in the business plan margin.

## Big questions (YC style, no money promises)

- If this worked perfectly, how many people would use it in a year? Who are they?
- What would you build if you had ten times the users next month?
- Why now? What changed that makes this possible today?
- What do you know about this problem that most people don't?
- What is the smallest version you could put in front of someone this week?

## Pushing to build and distribute

- Every stage ends with a "ship" item and a deadline in days.
- The daily check-in asks what shipped yesterday and what ships today.
- Distribution starts at Validation (sign-up page, outreach), not after Build.
- Weekly update in plain words: what shipped, the number, what's next (like an accelerator's weekly update).

## Traction or pivot

- Each stage's metric is compared with the target the founder set before the test.
- At or above target: show it plainly (and Ahmed Tarek smiles, the only time he does).
- Under target: say so in red. Offer repeat, pivot, or stop. A pivot is saved as a new version of the business plan, so the history is visible.

## Not niche-specific

- Stage content is generic. Founder-specific words come from their own answers (group, skill, problem), dropped into the questions.
- Example text in the UI uses several founders (a tutor, a grandmother with recipes, a microbus driver), not one.

## How we build it

1. `api/program.py` plus `config/program.yaml`: the stage table above as data. Each resource has a checked URL and a one-line "why now".
2. Tests first: every stage has all parts; every resource URL is in the checked list; no stage text promises income (guardrail check over the file); questions insert founder words.
3. API: `GET /runs/{id}/program` returns the current stage card (goal, coach, big question, questions, do today, ship, metric, learn, case).
4. Web: a "This week" card in the right panel and a stage section in the business plan document. Coaches change with the stage; a short handoff line ("The Hustler joins to help you reach strangers") when a new agent arrives.
5. Daily check-in reads the stage card.
6. Judge audit after it lands: completeness against `planning/SCORING.md` and `CLAUDE.md`.

## Honesty rules

- No income promises, ever, including in "think big" prompts.
- Every resource and case study links to a page that says what we claim. If not checked, it isn't shown.
- Simulated parts (shark panel, Ahmed Tarek) are labelled.
