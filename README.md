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
| `demo-sentry-issues` | `https://sentry.io/api/0` | Read-only; narrow to the approved organisation's issue prefix |
| `demo-sentry-project` | `https://sentry.io/api/0` | Read-only; narrow to one approved project's prefix |

All six use Bearer tokens and require no interactive OAuth. The `demo-` IDs distinguish these definitions from the MediaWorks catalog, allowing both plugins' connections to coexist without replacing one another.

1. Open **Connections → Available** and select the intended organisation or team.
2. Choose **Configure** for the required definition. Review the API base URL and read-only setting; configure the optional write connections only when needed.
3. For Sentry, confirm the organisation/project and API region, then narrow the base URL to `https://sentry.io/api/0/organizations/{org}/issues/` or `https://sentry.io/api/0/projects/{org}/{project}/` before entering a token. Replace the placeholders with verified values. A different region/host requires editing the definition and re-syncing; Configure can narrow its existing origin/path only.
4. Enter the appropriate token in **Secret** and save. Expo uses a robot-user token, Vercel a token scoped to the intended team/project, and Sentry an internal-integration token with `event:read` and `project:read` for these read workflows.

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

## API connection sources

- [Cengrid connection-definition schema and configuration](https://github.com/shelf-b2b/cengrid/blob/0250ca1bb70279b022946db81f4b2666fa330d8f/docs/connections.md#plugin-api-definitions)
- [Expo programmatic access and robot users](https://docs.expo.dev/accounts/programmatic-access/)
- [Expo Workflows REST API](https://docs.expo.dev/eas/workflows/rest-api/)
- [Vercel access tokens](https://vercel.com/docs/accounts/access-tokens)
- [Vercel REST API](https://vercel.com/docs/rest-api)
- [Sentry API authentication](https://docs.sentry.io/api/auth/)
- [Sentry API permissions](https://docs.sentry.io/api/permissions/)
- [Sentry API hosts and regions](https://docs.sentry.io/api/)
