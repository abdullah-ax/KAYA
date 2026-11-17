#!/usr/bin/env python3
"""PreToolUse guard: allow GitHub MCP calls only against abdullah-ax/KAYA."""
import json
import re
import sys

OWNER = "abdullah-ax"
REPO = "kaya"  # compared case-insensitively
SCOPE = f"repo:{OWNER}/{REPO}"

# Tools that take no repository but are harmless to allow.
ALLOW_NO_REPO = {"get_me"}


def decide(allow, reason=""):
    if allow:
        sys.exit(0)
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": f"kaya-github: {reason} Only {OWNER}/KAYA is allowed.",
        }
    }))
    sys.exit(0)


def main():
    try:
        data = json.load(sys.stdin)
    except Exception:
        decide(False, "could not parse hook input.")
    tool = data.get("tool_name", "")
    args = data.get("tool_input") or {}
    short = tool.rsplit("__", 1)[-1]

    owner = args.get("owner")
    repo = args.get("repo")

    # Search tools: the query itself must pin the KAYA repo, and nothing else.
    if short.startswith("search_"):
        q = str(args.get("query") or args.get("q") or "").lower()
        scopes = re.findall(r"\b(?:repo|org|user|owner):\S+", q)
        if scopes and all(s == SCOPE for s in scopes):
            decide(True)
        decide(False, f"search queries must include '{SCOPE}' and no other repo/org/user filter.")

    # Forks, transfers etc. may name a destination org/owner.
    for key in ("organization", "new_owner", "target_owner"):
        if args.get(key) and str(args[key]).lower() != OWNER:
            decide(False, f"'{key}' must be {OWNER}.")

    if owner is None and repo is None:
        if short in ALLOW_NO_REPO:
            decide(True)
        decide(False, f"'{short}' does not target a single repository.")

    if str(owner or "").lower() == OWNER and str(repo or "").lower() == REPO:
        decide(True)
    decide(False, f"blocked call to {owner}/{repo}.")


if __name__ == "__main__":
    main()
