# Mascots: which character is which agent

The art is in `assets/mascots/` (folder layout in its own README). Copy it into the web app's `public/mascots/`.

## Who is who

| Agent | Mascot folder |
|---|---|
| Co-founder (one per type) | `cofounder/numbers_hawk`, `hustler`, `brand_builder`, `operator`, `warm_skeptic` |
| Profiler | `crew/profiler` |
| Research intern, marketing intern | `crew/intern` |
| Boss | `crew/boss` |
| Evidence judge | `judges/judge_long` |
| Founder-fit judge | `judges/judge_barn` |
| Rules and style judges | `judges/judge_wee` |
| Shark panel | `sharks/shark_numbers`, `shark_people`, `shark_brand`, `shark_retail`, `shark_tech` |
| Ethics bot | **missing: needs its own mascot** |

## When each animation plays

| App state | Animation |
|---|---|
| Nothing happening | `idle_look` |
| Founder holds the talk button | `listening` |
| Model is working | `thinking` |
| Voice reply playing | `talking` |
| Gate result is go, or the founder confirms a decision | `approve_stamp` |
| Gate result is stop, a boss rejection, or a shark says "I'm out" | `reject_stamp` |
| A phase finishes | `celebrate` (once, never looping) |

## Rules

- Roster and chat avatars use `avatar/avatar_circle.svg`. Use the 44 px and 88 px PNGs only where SVG won't work.
- Animations: `anim/<name>.webm` (has transparency). Safari and iOS can't show WebM transparency, so use `anim/<name>_sheet.png` there: a 6x6 sprite sheet, 36 frames of 256x256, 12 fps.
- Respect reduced motion: when the user asks for less motion, show the still `expressions/<name>.svg` instead.
- Mascots never replace words. Every state also shows in text ("Listening…", "STOP").
- Red only for STOP, "I'm out", and the Boss's pencil, as the art already does.

## Living mascots (Grok Bot feel)

Mascots are never frozen. Everywhere one appears (team list, chat header, judges' notes, shark panel), it moves.

- **Default:** `idle_look` loops (eyes glance around, blinks). Each character already has its own look-around routine, so a row of them never moves in sync.
- **Idle actions:** every 8–20 seconds (random per mascot), play one short action once, then return to `idle_look`. Pick from: `thinking`, `listening`, `talking`, `celebrate` (rare), plus a still expression for 1.5 s (`pleased`, `skeptical`). Weight it by the agent's state: a judge with a new fail note leans `skeptical`; a co-founder waiting on the founder leans `listening`.
- **Real state wins over idle:** when an agent is working it shows `thinking`; while its message streams or speaks it shows `talking`; while the founder holds the talk button, the agent being spoken to shows `listening`; gate results fire `approve_stamp` or `reject_stamp` once.
- **Stagger:** start each mascot at a random frame so nothing starts together.
- **Calm by default:** only one mascot at a time plays a big action (stamp, celebrate). Others keep idling.
- **Reduced motion:** when the user asks for less motion, show the still `expressions/neutral.svg` and swap stills for states.

### One component for all of it (React)

Use the sprite sheets (they work in every browser, including Safari): 6x6 grid, 36 frames of 256x256, 12 fps.

```tsx
// components/Mascot.tsx
import { useEffect, useRef, useState } from "react";

type Anim = "idle_look" | "thinking" | "listening" | "talking" | "celebrate" | "approve_stamp" | "reject_stamp";
const IDLE_ACTIONS: Anim[] = ["thinking", "listening", "talking", "idle_look", "idle_look"];

export function Mascot({ path, size = 44, state }: { path: string; size?: number; state?: Anim }) {
  const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [anim, setAnim] = useState<Anim>("idle_look");
  const [frame, setFrame] = useState(() => Math.floor(Math.random() * 36));
  const oneShot = useRef(false);

  // Real state wins over idle.
  useEffect(() => { if (state) { setAnim(state); setFrame(0); oneShot.current = state !== "idle_look"; } }, [state]);

  // 12 fps frame clock; one-shot actions return to idle at the end.
  useEffect(() => {
    if (reduce) return;
    const t = setInterval(() => setFrame(f => {
      if (f === 35 && oneShot.current && !state) { oneShot.current = false; setAnim("idle_look"); return 0; }
      return (f + 1) % 36;
    }), 1000 / 12);
    return () => clearInterval(t);
  }, [reduce, state]);

  // Random idle action every 8–20 s.
  useEffect(() => {
    if (reduce || state) return;
    let id: ReturnType<typeof setTimeout>;
    const next = () => {
      id = setTimeout(() => {
        setAnim(IDLE_ACTIONS[Math.floor(Math.random() * IDLE_ACTIONS.length)]);
        setFrame(0); oneShot.current = true; next();
      }, 8000 + Math.random() * 12000);
    };
    next();
    return () => clearTimeout(id);
  }, [reduce, state]);

  if (reduce) return <img src={`/mascots/${path}/expressions/neutral.svg`} width={size} height={size} alt="" />;
  const col = frame % 6, row = Math.floor(frame / 6);
  return (
    <span aria-hidden="true" style={{
      display: "inline-block", width: size, height: size, borderRadius: "50%",
      backgroundImage: `url(/mascots/${path}/anim/${anim}_sheet.png)`,
      backgroundSize: `${size * 6}px ${size * 6}px`,
      backgroundPosition: `-${col * size}px -${row * size}px`,
    }} />
  );
}
```

`path` is the folder under `public/mascots/`, for example `cofounder/warm_skeptic`. The sheets show the full head, not the circle crop; put the component inside a round, cream-filled frame for the team list.
