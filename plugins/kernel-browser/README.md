# Kernel browser and QA

An optional CenGrid plugin for testing app flows, inspecting browser diagnostics and
reviewing visual results. The agent uses CenGrid's existing harness tools to control a
Kernel browser. It does not install another model-driven browsing SDK.

## Available components

| Kind        | Name             | Purpose                                                                          |
| ----------- | ---------------- | -------------------------------------------------------------------------------- |
| Connection  | `kernel-browser` | Team-configured Kernel REST API with a project-scoped Bearer key                 |
| Skill       | `kernel-browser` | Flow tests, screenshots, console/network evidence, server logs and login handoff |
| Agent       | `kernel-qa`      | Focused QA on Haiku 5.5, returning evidence to the coding agent                  |
| Instruction | `kernel-browser` | Routes requested browser QA to the added skill/agent                             |
| Environment | `kernel-cli`     | Node 24.18.0, Kernel CLI 0.49.0, websocat 1.14.1 and OpenSSH client              |

Nothing is installed or enabled automatically. Add only the components required by the
organisation or team.

## Configure a team

1. Connect `shelf-b2b/cengrid-plugin-demo` as a marketplace and Re-sync it, then connect
   **Kernel browser and QA**. Its plugin path is `plugins/kernel-browser`.
2. At the intended team scope, open **Connections → Available**, configure **Kernel
   browsers**, enter a Kernel project-scoped API key in **Secret**, save and enable it.
   The fixed base URL is `https://api.onkernel.com`; the connection health check lists
   one browser. No credentials or account IDs are stored in this repository.
3. Add the `kernel-browser` skill to that team. Its connection helper uses the current
   conversation's `AGENT_API_URL` and `AGENT_API_TOKEN`. CenGrid selects the scoped
   connection and supplies its secret server-side. Browser creation, Playwright actions,
   screenshots and bounded diagnostics work without exporting a Kernel key to the sandbox.
4. Add the `kernel-cli` environment if Node is missing or private development tunnels
   are needed. Its installation has no login or credential prompts. A computer that
   already has Node 24 can use the scoped connection helper without installing the CLI.
5. Optionally add the `kernel-qa` agent and routing instruction on the **Pi harness**.
   Its reasoning and output settings require Pi. Configure the existing OpenRouter
   model capability and refresh the model catalog so
   `anthropic/claude-haiku-5.5` is available. The importer validates model availability;
   an unavailable model can prevent the plugin from connecting. It does not silently
   substitute another model. The skill itself can use the conversation's selected model
   on other harnesses.

Imported items are read-only: edit their source in GitHub and Re-sync for shared changes.
A custom team QA agent can use the same browser skill with a different configured model.

The API template permits POST `/browsers`, PATCH/DELETE `/browsers/*` and POST
`/browsers/*/playwright/execute`; other writes are blocked by CenGrid. Reads stay within
the configured endpoint and upstream project key. Browser actions still follow the
requested test's data permissions. Sessions and personal profiles are not shared merely
because the plugin is installed.

### CLI authentication and local development

The team REST connection and CLI credential are separate. A connection secret is never
read back or automatically injected into the sandbox. For the optional CLI/tunnel path,
an administrator must separately provide an authorized `KERNEL_API_KEY` through CenGrid's
keychain/environment delivery for the intended conversation, using the same Kernel project
as the browser. Review that credential's actual delivery scope; do not broaden a private
team credential to organization-wide environment delivery. Use the scoped connection-only
path with an already reachable test URL when CLI access is not configured.

Kernel runs remotely. The private tunnel helper uses Kernel's supported SSH reverse
forwarding so a browser can reach a Sprite-local app without publishing it. It requires
the CLI credential, websocat and OpenSSH. The helper stays in `background`, detects SSH
failure and removes its temporary key on termination. It does not deploy an app or open
a public preview automatically.

Kernel CLI 0.49.0 configures SSH `GatewayPorts yes`. Its server can bind the forwarded
port on the VM's interfaces even when the client requests loopback. Isolation therefore
depends on the task VM and Kernel's network controls; the client bind alone does not
enforce it. This has not been tested for public Internet reachability on a live Kernel VM.

### Hosted MCP

Kernel also provides `https://mcp.onkernel.com/mcp`, using interactive OAuth 2.1 with
dynamic registration. CenGrid's current imported MCP configuration does not support that
login flow, and its MCP bridge returns text rather than image blocks. This plugin supplies
the working REST connection instead of an MCP entry that cannot authenticate. It makes
no claim that a Kernel API key can authenticate the hosted MCP service.

## Model choice

The optional QA agent uses **Claude Haiku 5.5 through OpenRouter**, medium reasoning,
with an 8,192-token output ceiling per call. This is a CenGrid agent model selection,
not a second browser-model configuration. Use the main coding agent for implementation
and difficult debugging; switch to a stronger configured QA agent when the evidence
shows the inexpensive one cannot complete the task.

At the October 19, 2026 check, Haiku 5.5 starts at **$0.10 input / $0.50 output per
million tokens** for prompts up to 100,000 tokens. Above that boundary the rates are
$0.50/$2.50. Sonnet 5.5 starts at $2/$10 and is a stronger escalation candidate.
Anthropic's published OSWorld 2.1 offline score is 72.4% for Haiku 5.5 versus 48.9%
for GPT-6 Luna; Sonnet scores higher on complex coding. These are vendor evaluations,
not a benchmark of this plugin or a guarantee for your app. Kernel browser hosting is
billed separately. Keep DOM results and logs selective, and measure completion rate,
retries and total task cost on the team's own flows before expanding use.

Sources: [Haiku launch and evaluations](https://www.anthropic.com/claude-haiku-5-5),
[pricing and capabilities](https://platform.claude.com/docs/en/models/haiku-5-5/overview),
[OpenRouter model](https://openrouter.ai/anthropic/claude-haiku-5.5),
[public model catalog](https://openrouter.ai/api/v1/models?supported_parameters=tools).

## Testing and limits

From this repository root:

```sh
node --test plugins/kernel-browser/tests/runtime.test.mjs
CENGRID_SOURCE_DIR=/path/to/cengrid node --experimental-test-module-mocks \
  --test tests/catalog.test.mjs
```

Runtime tests use fake Kernel/CenGrid/SSH processes and responses to verify scoped requests,
failure detection, screenshot decoding and tunnel cleanup. Catalog tests use a local CenGrid
checkout to validate the actual plugin, install it at team scope and run the helper through
the real core HTTP API with an injected upstream response. Those tests explicitly skip if
`CENGRID_SOURCE_DIR` is unset. They do not create paid browser sessions or evaluate a model.
Manual acceptance scenarios are in
`agents/kernel-qa/test_cases.json`.

Validate the whole plugin with CenGrid's `parsePluginCatalog` after loading its supported
model catalog. Check that the skill, instruction, agent, environment and API definition
import without errors.

Kernel's telemetry API paginates through response headers that CenGrid's API broker
currently omits. The skill labels a full bounded page as partial coverage; optional CLI
retrieval supports `--all`. Binary screenshots use Playwright base64 results decoded
locally, avoiding the text broker's binary limitation. During human login the skill
pauses all browser telemetry, retains the same browser and restores the prior capture
configuration after authentication finishes.
The broker has a 30-second request ceiling; connection-based Playwright actions use a
20-second execution budget. Split longer flows into observed steps or use the separately
authorized CLI. A transport timeout leaves an action's outcome uncertain: inspect state
before repeating it.

Kernel commands and API shapes follow the
[pinned CLI release](https://github.com/kernel/cli/tree/v0.49.0),
[API schema](https://api.onkernel.com/spec.yaml),
[SSH guide](https://www.kernel.sh/docs/browsers/ssh) and
[telemetry guide](https://www.kernel.sh/docs/browsers/telemetry/overview).
