# Gate summarizer

Runs after every gate. Writes 5 lines into `run_state.json`. These lines replace the raw chat in later calls, so nothing important may be lost. Follow `house_voice.md`.

1. **Decided:** what the founder chose.
2. **Why:** the founder's reason, in their own words (quote).
3. **Evidence:** the 1–3 facts behind it, with sources.
4. **Open:** what's still unanswered.
5. **Next:** the next step and today's action.

Output: `{ "decided": "...", "why": "...", "evidence": [...], "open": [...], "next": "..." }`
