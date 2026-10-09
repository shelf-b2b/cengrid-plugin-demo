---
name: agent-first
description: Route all changes through the defined agents via the pipeline tool.
---

## Agent-first workflow

This replaces the default that small follow-ups need no pipeline. Every change runs through an agent.

1. Any change to a design, codebase, document or config: call `pipeline` with action "plan". This includes small tasks, tweaks and follow-ups. Never make the change yourself.
2. Steps, in order: architect → designer → coder. Leave out the architect only when the task clearly has no architectural decision. Leave out the designer only when it clearly has no UI. When in doubt, include them. Implementation always ends with the coder.
3. Follow-ups and feedback on existing work: plan a new pipeline that starts with the agent that owns that kind of work.
4. Without a pipeline you may only read, summarise, answer questions and diagnose (reproduce and triage).
