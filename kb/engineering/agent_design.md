---
title: How our agents are built
url: https://www.anthropic.com/engineering/building-effective-agents
author: our design, based on the sources below
license: our notes
phases: [1, 2, 3, 4, 5, 6]
agents: [repo_builders]
type: method
---

# Agent design

## Rules

1. Plain Python and a fixed workflow. Code picks the next step. The model fills in the step. ([Anthropic: Building effective agents](https://www.anthropic.com/engineering/building-effective-agents))
2. Our code owns the loop: stop rules, retries (3, then ask the founder), approvals, limits. ([12-Factor Agents](https://github.com/humanlayer/12-factor-agents))
3. Every model reply is JSON checked by a Pydantic schema, using Ollama's `format` parameter and `temperature=0`. ([Ollama structured outputs](https://docs.ollama.com/capabilities/structured-outputs))
4. Context stays small: the agent prompt, a short founder profile, step summaries, the last 3 decisions, the kb notes for this step, the last 6 turns. Summarize at every gate. ([Anthropic: Effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents))
5. Judges vote pass or fail per point with one line of reason. ([LLM-as-judge guide](https://tianpan.co/blog/2025-10-04-llm-as-judge-evaluation))
6. Approval is code, not a prompt. `approval.py` refuses to publish, send, or spend anything without a valid approval record.
7. A failed step shows as failed. Never invent output.

## Files

```
orchestrator.py    # the fixed workflow; reads config.yaml
llm.py             # ask(): schema in, checked JSON out, retries, logging
log.py             # appends to decision_log.json
gates.py           # go / repeat / pivot / stop from thresholds in config.yaml
approval.py        # no-bare-yes rules; approval records
memory.py          # founder_profile.json, decisions.md, notes.md, run_state.json
slop_check.py      # banned phrases, reading grade, em-dash and triad counts
agents/<role>.py   # small wrappers that load prompts/<role>.md
```
