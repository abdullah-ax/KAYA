# kaya-github

A customized copy of the official GitHub MCP plugin, locked to **abdullah-ax/KAYA**.

Two layers of restriction:

1. **Hook (enforced by Claude Code):** `hooks/kaya_only.py` runs before every GitHub MCP tool call and denies it unless `owner`/`repo` is `abdullah-ax/KAYA`. Search calls must pin `repo:abdullah-ax/KAYA`. Tools with no repo (`list_notifications`, `create_repository`, `get_teams`, …) are denied, except `get_me`.
2. **Token (enforced by GitHub, recommended):** set `GITHUB_PERSONAL_ACCESS_TOKEN` to a *fine-grained* PAT with **Repository access → Only select repositories → KAYA**. Then even a call that bypassed the hook can't reach other repos.

Disable the stock `github` plugin when you enable this one, so its unrestricted tools aren't also loaded.
