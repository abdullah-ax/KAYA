# UI inspiration and taste rules

Look at real shipped products before designing any screen. Copy patterns, never logos, names, or exact layouts.

## Where to look

- **[Mobbin](https://mobbin.com)**: a searchable library of real app and web screens and full flows from shipped products. Free accounts get limited access. It also has an MCP connection so Claude Code can search it ([Mobbin](https://mobbin.com/index.md)).
- **Land-book** and **SaaSFrame**: real landing pages and SaaS dashboards ([alternatives list](https://emizentech.com/blog/apps-like-mobbin.html)).

## What to study, screen by screen

| Our screen | Study | What to take |
|---|---|---|
| Founder intake | Typeform, Duolingo onboarding | One question per screen, big type, progress shown, back button |
| Co-founder chat with voice | Claude and ChatGPT voice mode | Push-to-talk button, transcript shown before send, short spoken replies |
| Notes and decisions panel | Linear, Notion | Calm list, dates on the left, the founder's own words in quotes |
| Sources on every claim | Perplexity | Numbered inline citations that open the source |
| Gate (choose an option) | Stripe Checkout, Linear issue view | 2–3 side-by-side options, each with cost, risk, and source; a required "why" box |
| Daily check-in | Headspace, Duolingo daily goal | 3 questions, one lesson card, one action. No streak guilt |
| Shark panel | Board-game score cards | One card per shark: in or out, the reason, what would change their mind |

Search Mobbin for: "onboarding questionnaire", "voice mode", "citations", "comparison", "daily check-in", "empty state".

## Taste rules (anti-visual-slop)

From impeccable's anti-pattern list and its core rules ([impeccable](https://github.com/pbakaus/impeccable), [anti-patterns](https://www.mintlify.com/pbakaus/impeccable/concepts/anti-patterns)):

- No purple-to-blue gradients. No cyan on dark. No frosted glass everywhere.
- No card grids by default. Never cards inside cards.
- Body text contrast at least 4.5:1. Large text at least 3:1. No light gray text on off-white.
- Body lines 65–75 characters wide.
- One font only: Public Sans, with bold for hierarchy (Bedo's decision). Sizes 16, 20, 24, 32, and 48 for the one big question.
- Vary spacing for rhythm. The same gap everywhere looks machine-made.
- Motion only when it explains a change. Ease out, no bounce. Respect reduced motion.

Our own rules:

- Big text. One idea per slide or screen. 15 words per slide at most.
- Ink #111111 on #FAFAF7, one accent green #1E5A3C, one red #9B2C1F for fails and STOP.
- Layout: the Grok Bot pattern. Team roster left, chat center, working panel right. See `BUILD_TEAM_AND_STACK.md`.
- No AI-generated images in the product or deck. Mascots are drawn as a fixed set, not regenerated per screen.
- Every screen passes `npx impeccable detect` before it ships.

## Deck references

- [YC: How to build your seed round pitch deck](https://www.ycombinator.com/library/2u-how-to-build-your-seed-round-pitch-deck)
- [Airbnb 2008 deck](https://www.slideshare.net/slideshow/airbnb-pitch-deck-from-2008/65585661)
