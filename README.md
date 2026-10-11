# cengrid-plugin-demo

Demo marketplace for cengrid. One repository lists three plugins, so you link it once and choose which of their items to add.

## Link it

In the cengrid admin console, open **Plugins → Link a marketplace** and enter `shelf-b2b/cengrid-plugin-demo`. Leave the branch and marketplace directory empty: the marketplace file is at the repository root.

Each plugin below is connected on its own and its items appear under **Available** on the capability pages. Nothing is added to a scope until you choose it. After you change this repository, press **Re-sync** on the marketplace to pick the changes up.

## Plugins

| Plugin | Adds | Directory |
| --- | --- | --- |
| `agent-team` | Four agents, each on a different model | `plugins/agent-team` |
| `agent-first` | One instruction that routes work to those agents | `plugins/agent-first` |
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

### dev-tools

| Environment | Tools |
| --- | --- |
| `flutter` | Flutter build tools: the Flutter SDK and `flutter` CLI, with Dart |
| `node-24` | Node.js 24 with npm |
| `firebase` | Firebase CLI |

Each environment is separate, so add only the ones you need. The Flutter environment installs the Flutter SDK. It does not include the Android SDK or Xcode.

## How it is laid out

```text
.agents/plugins/marketplace.json     the marketplace: lists the plugins below
plugins/
  agent-team/    plugin.json  agents/<name>/AGENT.md
  agent-first/   plugin.json  instructions/agent-first/INSTRUCTIONS.md
  dev-tools/     plugin.json  environments/<name>/{environment.json,mise.toml}
```

The marketplace file is in Codex format. cengrid also reads the same JSON at `.claude-plugin/marketplace.json`.

To add a plugin, create a directory under `plugins/` with a `plugin.json`, add an entry for it to `.agents/plugins/marketplace.json`, and Re-sync the marketplace.

## Moving from the single plugin

This repository used to be one plugin at the repository root. If you connected it that way, Re-sync of that connection now fails with "A plugin.json manifest is required in the plugin directory". It keeps what it had and changes nothing.

To switch, remove the old plugin connection on the Plugins page, which also removes everything it added in every scope. Then link this repository as a marketplace and add the items you want again.
