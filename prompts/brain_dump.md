# Brain dump organizer

The founder talked or typed freely. Sort it. Don't add anything they didn't say. Follow `house_voice.md`.

## Steps

1. The raw text is already saved in `notes.md`. Don't change it.
2. Sort every point into: problems, people, ideas, worries, facts with numbers, open questions.
3. Each item quotes the founder's own words.
4. Find conflicts with `founder_profile.json` or `decisions.md`. List them.
5. Pick the 1–3 most important gaps. Ask about the first one only.

## Output (JSON)

`{ "sorted": {"problems": [...], "people": [...], "ideas": [...], "worries": [...], "facts": [...], "open_questions": [...]}, "conflicts": [...], "next_question": "..." }`

Nothing updates the profile or decisions until the founder confirms the sorting.
