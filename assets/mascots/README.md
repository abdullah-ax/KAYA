# Boardroom mascots v2: heads

16 characters as simple bold heads. Each has its own shape, minimal eyes, and one small prop or accessory. They're built to work as 44 px circle avatars first.

| Group | Characters (shape + prop) |
|---|---|
| Co-founder | numbers_hawk (shield, bowler, mini abacus), hustler (circle, flat cap, speed lines), brand_builder (wide squircle, boater, bow tie, megaphone), operator (tall capsule, top hat, clipboard), warm_skeptic (egg, reading glasses, pocket watch) |
| Crew | profiler (hexagon, porkpie, pencil, notebook), intern (small circle, bellhop cap, big clipboard), boss (wide square, homburg, push-broom mustache, red pencil) |
| Judges | judge_long (tall ink owl, tufts, gavel), judge_barn (heart face, bow tie, scorecard), judge_wee (small green owl, ledger). All wear green visors |
| Shark Panel | shark_numbers (tall bullet, bowler, specs, adding tape), shark_people (triangle, big fin, magnifier), shark_brand (wide bullet, top hat, placard), shark_retail (circle, shop cap, price tag), shark_tech (hammerhead with goggle eyes, wrench) |

## Files for each character

```
<group>/<character>/
  head/head.svg, head_44|88|256|512.png      transparent
  avatar/avatar_circle.svg, avatar_circle_44|88|256|512.png
  expressions/<name>.svg|png  + sheet.png    neutral, listening, thinking, pleased, skeptical, im_out
  anim/<name>_sheet.png                      sprite sheet, 6x6 grid, 36 frames of 256x256, transparent
  anim/<name>.webm                           VP9 with alpha
  anim/<name>_paper.mp4                      H.264 on paper #FAFAF7 (MP4 can't hold transparency)
```

Animations: `idle_look` (the main idle, eyes glancing left, right, up and back at you, with blinks and a head that follows a beat later), `talking`, `listening`, `thinking`, `approve_stamp`, `reject_stamp`, `celebrate`.
All run 12 fps, 36 frames (3 s), and loop seamlessly. Each character has one of four look-around routines, so a group of them never moves in sync.
Safari and iOS don't play VP9 transparency, so use the sprite sheets there.

Palette: ink #111111, paper #FAFAF7, green #1E5A3C, red #9B2C1F. Red only appears for STOP, "I'm out", and the Boss's red pencil.
Every outline uses one stroke weight (SW = 10 on the 512 canvas, in `_source/rig.py`).
