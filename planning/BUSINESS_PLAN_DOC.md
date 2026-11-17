# Living business plan document

A document the founder can open at any point. It is built only from files already on disk (outputs/, decision_log.json, state.json). Nothing is invented. A section with no file behind it says "Not yet written".

## Data model

`build_plan(run_dir, state)` returns:

- `overview`: `{stage, status_text, waiting_on, next_step, issues: [{text, section, severity}]}`. Severity is `high`, `medium` or `low`.
- `sections`: `{id, title, body_markdown, sources, assumptions, status}` in this order: `profile`, `opportunity`, `canvas`, `signup`, `decisions`. Status is `written` or `not_yet`. `sources` are the source cards (url, title, trust, claims). `assumptions` counts canvas rows marked ASSUMPTION.
- `critique`: `[{section, emotion, line}]`, from the rule-based `tarek_critique(plan)`.
- `versions`: `[{n, at, event, summary, sections_hash}]`, no bodies.

Issues come from real signals only: a gate that recommends stop, repeat or pivot; a section whose sources are all low-trust; the ASSUMPTION count; rejected drafts (with the reason from the file); sections not written yet (severity low).

## Versions and pivots

`snapshot(run_dir, event, summary, option=None)` appends `{n, at, event, summary, sections_hash, sections}` to `run_dir/plan_versions.json` (cap 50, oldest dropped, `n` keeps counting). The orchestrator calls it after each written draft (`draft`, or `redraft` when the boss asked for a second draft) and after each gate decision (`decision`).

A decision becomes `pivot` when the founder picks a pivot or repeat option ("Repeat the test", or any option with pivot or repeat in its name), or picks a different opportunity than the previous version recorded. It becomes `stop` when the founder stops ("Stop here", "Stop or pivot" is a stop because the gate saves outcome stop). Otherwise it stays `decision`.

## API

- `GET /runs/{id}/plan`: current plan, critique and version list without bodies.
- `GET /runs/{id}/plan/versions/{n}`: one full snapshot.
- `GET /runs/{id}/plan.md`: Markdown export with a header, each claim's source URL or ASSUMPTION, and the critique marked as parody.

Run ids are validated like `/runs/{id}/log` (word characters only, 404 otherwise).

## UI

A "Plan" button (FileText) sits next to the map button in live and demo mode. It opens a full-screen dialog (Escape closes). Top: overview card with stage, what waits on the founder, red issues that link to sections. Left: outline and version timeline (Pivot and Stop badges, newest first). Center: the document at 65 to 75ch with citations, visible ASSUMPTION labels and "Not written yet" placeholders. Right: Ahmed Tarek critique per section with a Parody label and one disclaimer. Picking a version shows it read-only with "Viewing version N" and "Back to current", plus a "What changed" list. Under 1024px the outline and critique become tabs above the document. Demo mode builds the plan from demo data and says so.

## Honesty rules

- Never invent content: no file, no section.
- Every claim shows its source URL or the word ASSUMPTION.
- Tarek is always labelled Parody, not affiliated, not investment advice. No quotes attributed to the real person.
- Tarek uses serious emotions only. "pleased" only when sign-ups are at or above target and no section rests on low-trust sources alone.
- Each critique line names the real numbers it is based on.
- Weak results are red and plain.
