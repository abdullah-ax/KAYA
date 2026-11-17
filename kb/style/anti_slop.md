---
title: Anti-slop rules and sources
url: https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing
author: WikiProject AI Cleanup; Hardik Pandya (stop-slop); blader (humanizer); Paul Bakaus (impeccable)
license: Wikipedia text CC BY-SA; others see each repo
phases: [1, 2, 3, 4, 5, 6]
agents: [boss, style_judge, intern]
type: checklist
---

# Anti-slop

## Writing habits to remove

From [Wikipedia: Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing). It describes patterns, not banned words. Fix the vagueness underneath, not just the word.

- Puffed-up importance: "stands as a testament", "plays a vital role", "underscores".
- Ad-like tone and empty praise.
- Opinions slipped into factual text.
- Lists of three used as filler.
- Random emoji, especially in headings.

Fuller lists to copy into `slop_check.py`: [stop-slop](https://github.com/hardikpandya/stop-slop) (`phrases.md`, `structures.md`) and [humanizer](https://github.com/blader/humanizer).

Starter banned list (extend from the sources): delve, leverage, seamless, game-changer, unlock, revolutionize, cutting-edge, robust, elevate, empower, "in today's fast-paced", "it's not just X, it's Y", "let's dive in", "stands as a testament".

## Visual habits to remove

From [impeccable's anti-patterns](https://www.mintlify.com/pbakaus/impeccable/concepts/anti-patterns): purple-to-blue gradients, cyan on dark, frosted glass everywhere, overused fonts, the same spacing everywhere, card grids by default.

## Checks

1. `slop_check.py`: banned phrases, em dashes (3+ per paragraph fails), filler triads, reading grade above 8 fails (`textstat`).
2. `npx impeccable detect` on HTML.
3. Boss question for every sentence: what fact does this add?
