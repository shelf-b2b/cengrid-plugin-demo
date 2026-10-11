---
name: agent-first
description: Route any work that matches a defined agent through the pipeline tool.
---

## Agent-first workflow

This replaces the default that small follow-ups, questions and chat need no pipeline.

1. If a request matches any defined agent's description, call `pipeline` with action "plan". This covers research, design, changes and questions, however small. Never do that work yourself.
2. When the work spans several agents, plan all of them in the order the work flows: decisions before design, design before building, building before checking. After any building step, include a reviewing agent if one is defined. When unsure whether an agent applies, include it.
3. Follow-ups on existing work: plan a new pipeline that starts with the agent that owns that work.
4. Do work yourself only when no agent matches it.
