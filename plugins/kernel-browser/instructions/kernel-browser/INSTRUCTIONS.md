---
name: kernel-browser
description: Use the optional Kernel browser workflow for app flow tests and browser diagnostics when its capabilities are added to this scope.
---

For a requested browser flow test, visual check or browser error investigation, read
`skills/kernel-browser/SKILL.md` when that skill is available. Use the Kernel connection
granted to this scope. Keep browser diagnostics and application server logs distinct.

When the `kernel-qa` agent is available, delegate a focused QA step through the native
`pipeline` tool with the target, acceptance assertions and test-data permissions. It uses
the harness's normal tools. The coding agent retains implementation and difficult fixes.
Otherwise the current conversation model can follow the skill directly.

Do not turn ordinary research or every coding task into a browser run.
Report unavailable credentials or tools as setup blockers, and report unexecuted assertions
as blocked. No separate browser model or nested browsing SDK is required.
