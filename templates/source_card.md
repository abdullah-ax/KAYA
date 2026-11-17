# Source card

Every source an agent uses gets one card in `outputs/phase<N>_step<M>_sources.json` (one entry per source). The evidence judge checks every card. A claim may only cite a source that has a card.

```json
{
  "id": "S12",
  "url": "https://...",
  "title": "...",
  "publisher": "...",
  "date_published": "2026-10-01 or unknown",
  "date_accessed": "2026-11-17",
  "type": "primary | secondary | vendor | opinion | our_interview",
  "trust": "high | medium | low",
  "trust_reason": "one line: who wrote it, what they gain, how they know",
  "claims_backed": ["exact sentence in our output that cites this source"],
  "quote_or_number": "the exact number or short phrase used (under 15 words)",
  "conflicts_with": ["S7 says 31%, this says 40%"],
  "used_by": "research_intern",
  "step": "phase1_step2"
}
```

## Trust rules

- **High:** official data (central bank, statistics office), the original author's own page, peer-reviewed work, our own recorded interviews.
- **Medium:** established news, well-known reports that cite their data.
- **Low:** vendor blogs selling the thing they describe, SEO list pages, anonymous posts, AI-written summaries.
- A low-trust source can't be the only support for a gate decision. Find a second source or mark the claim `ASSUMPTION`.
- When two sources disagree, show both and the range. Never pick the nicer number.
