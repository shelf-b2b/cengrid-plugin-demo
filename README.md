# cengrid-plugin-demo

Demo marketplace for cengrid. One repository lists four plugins, so you link it once and choose which of their items to add.

## Link it

In the cengrid admin console, open **Plugins → Link a marketplace** and enter `shelf-b2b/cengrid-plugin-demo`. Leave the branch and marketplace directory empty: the marketplace file is at the repository root.

Each plugin below is connected on its own and its items appear under **Available** on the capability pages. Nothing is added to a scope until you choose it. After you change this repository, press **Re-sync** on the marketplace to pick the changes up.

## Plugins

| Plugin | Adds | Directory |
| --- | --- | --- |
| `agent-team` | Four agents, each on a different model | `plugins/agent-team` |
| `agent-first` | One instruction that routes work to those agents | `plugins/agent-first` |
| `api-connections` | Six REST API connection definitions for Expo, Vercel and Sentry | `plugins/api-connections` |
| `dev-tools` | Three environments: Flutter build tools, Node 24 and Firebase CLI | `plugins/dev-tools` |

### agent-team

| Agent | Model |
| --- | --- |
| architect | `openai/gpt-5.6-luna` |
| designer | `meta/muse-spark-1.3` |
| coder | `z-ai/glm-5.3` |
| code-reviewer | `anthropic/claude-sonnet-5.5` |

The agents run on OpenRouter models, so the deployment needs an OpenRouter key and these models in its catalog. A plugin with an agent whose model is unavailable is not connected, and its row on the marketplace card shows the reason.

### agent-first

| Instruction | Purpose |
| --- | --- |
| agent-first | Route any work that matches a defined agent through the pipeline tool |

Add it alongside `agent-team`. It tells the assistant not to do work that matches a defined agent itself, so it changes behavior wherever you add it.

### api-connections

This plugin demonstrates secret-free connection definitions. It requires a Cengrid deployment with [plugin API connection support](https://github.com/shelf-b2b/cengrid/pull/18). Linking or re-syncing the marketplace makes the definitions available; credentials and scope access are configured separately.

| Definition | API base URL | Access |
| --- | --- | --- |
| `demo-expo-workflows` | `https://api.expo.dev` | Read-only workflow inspection |
| `demo-expo-workflow-dispatch` | `https://api.expo.dev/v2/workflows/dispatch` | Optional workflow dispatch; permits writes |
| `demo-vercel-inspection` | `https://api.vercel.com` | Read-only projects, deployments and build logs |
| `demo-vercel-deployments` | `https://api.vercel.com/v13/deployments` | Optional deployment access; permits writes |
| `demo-sentry-issues` | `https://sentry.io/api/0` | Read-only; keep the API root for shared reads or narrow to the intended organisation's issue prefix |
| `demo-sentry-project` | `https://sentry.io/api/0` | Optional read-only project connection for narrow coverage |

All six use Bearer tokens and require no interactive OAuth. The `demo-` IDs distinguish these definitions from the MediaWorks catalog, allowing both plugins' connections to coexist without replacing one another.

1. Open **Connections → Available** and select the intended organisation or team audience.
2. Choose **Configure** for the required definition. Review the API base URL and read-only setting; configure the optional write connections only when needed.
3. For Sentry, confirm the organisation/project and API region, then choose the shared or narrow coverage below before entering a token. Replace placeholders with verified values.
4. Enter the appropriate token in **Secret** and save. Expo uses a robot-user token, Vercel a token scoped to the intended team/project, and Sentry an internal-integration token with the read permissions for the chosen coverage.

The organisation's administrator chooses the Sentry connection layout:

| Coverage | Configuration | Token permissions for these reads |
| --- | --- | --- |
| Shared API root | Configure `demo-sentry-issues` at `https://sentry.io/api/0` for issue and project release reads through one read-only connection. The separate `demo-sentry-project` connection is optional. | `event:read` and `project:read` |
| Narrow issue and project prefixes | Configure `demo-sentry-issues` at `https://sentry.io/api/0/organizations/{org}/issues/` and, when project release reads are needed, `demo-sentry-project` at `https://sentry.io/api/0/projects/{org}/{project}/`. | `event:read` for issue reads; `project:read` for project release reads |

Sentry internal-integration tokens are organisation-wide, with the integration's permissions controlling upstream access. Cengrid's configured endpoint restricts the API paths the connection can call; its organisation or team scope controls who can use the connection. Choose that audience independently of whether coverage uses the API root or narrower prefixes.

Configure can keep the definition's endpoint or narrow it within the same origin and base path. A different API region/host requires editing the definition and re-syncing. Changing a saved authenticated endpoint requires re-entering the token in **Secret**; use the secure token source rather than extracting a saved credential.

No tokens, account identifiers or team grants are included in this repository. These entries teach the connection-definition format; provider workflow skills are supplied separately by the [MediaWorks plugins](https://github.com/mediaworks-holdings/mw-cengrid-plugins).

### dev-tools

| Environment | Tools |
| --- | --- |
| `flutter` | Flutter build tools: the Flutter SDK and `flutter` CLI, with Dart |
| `node-24` | Node.js 24 with npm |
| `firebase` | Firebase CLI |

Each environment is separate, so add only the ones you need. The Flutter environment installs the Flutter SDK. It does not include the Android SDK or Xcode.

## How it is laid out

```text
marketplace.json                     the marketplace: lists the plugins below
plugins/
  agent-team/    plugin.json  agents/<name>/AGENT.md
  agent-first/   plugin.json  instructions/agent-first/INSTRUCTIONS.md
  api-connections/ plugin.json connections.json
  dev-tools/     plugin.json  environments/<name>/{environment.json,mise.toml}
```

To add a plugin, create a directory under `plugins/` with a `plugin.json`, add an entry for it to `marketplace.json`, and Re-sync the marketplace.

## Moving from the single plugin

This repository used to be one plugin at the repository root. If you connected it that way, Re-sync of that connection now fails with "A plugin.json manifest is required in the plugin directory". It keeps what it had and changes nothing.

To switch, remove the old plugin connection on the Plugins page, which also removes everything it added in every scope. Then link this repository as a marketplace and add the items you want again.

## Sources

- [Cengrid connection-definition schema and configuration](https://github.com/shelf-b2b/cengrid/blob/0250ca1bb70279b022946db81f4b2666fa330d8f/docs/connections.md#plugin-api-definitions)
- [Expo programmatic access and robot users](https://docs.expo.dev/accounts/programmatic-access/)
- [Expo Workflows REST API](https://docs.expo.dev/eas/workflows/rest-api/)
- [Vercel access tokens](https://vercel.com/docs/accounts/access-tokens)
- [Vercel REST API](https://vercel.com/docs/rest-api)
- [Sentry API authentication](https://docs.sentry.io/api/auth/)
- [Sentry API permissions](https://docs.sentry.io/api/permissions/)
- [Sentry API hosts and regions](https://docs.sentry.io/api/)
- [Sentry internal integrations and organisation-wide tokens](https://docs.sentry.io/integrations/integration-platform/internal-integration/)
- [Sentry organisation issue path and read permission](https://docs.sentry.io/api/events/retrieve-an-issue/)
- [Sentry project release path and read permission](https://docs.sentry.io/api/releases/list-a-projects-releases/)
