# Web design

An optional CenGrid plugin with two website-design skills, moved from CenGrid's starter
catalog with their names and supporting files preserved.

| Skill                 | Purpose                                                      |
| --------------------- | ------------------------------------------------------------ |
| `taste-skill`         | Website-design process and the preserved MIT design playbook |
| `popular-web-designs` | Design catalog with 54 reference templates                   |

## Configure a team

1. Connect `shelf-b2b/cengrid-plugin-demo` as a marketplace and Re-sync it, then connect
   **Web design**. Its plugin path is `plugins/web-design`.
2. Add the desired skills to the organisation or team. Add both to follow their
   cross-references. Importing the plugin alone does not enable either skill.
3. For visual verification, use an enabled browser tool according to its own instructions.
   Report when browser verification is unavailable.

The plugin has no browser-provider, connection, environment, agent or model dependency.
The current conversation model follows the skills. A team can choose any compatible
browser-testing tool independently. Imported skills are read-only; edit their source in
GitHub and Re-sync for shared changes.

If these skills were previously added from `kernel-browser`, re-syncing that plugin
removes its copies. Add the skills again from **Web design** in each scope that needs them.
The move does not automatically transfer their scope settings.

## Testing and provenance

From the repository root, run:

```sh
CENGRID_SOURCE_DIR=/path/to/cengrid node --experimental-test-module-mocks \
  --test tests/catalog.test.mjs
```

This developer test uses a local CenGrid checkout to verify that the design plugin imports
and installs independently of browser connections and model configuration. It also checks
the 54 reference templates and the preserved `taste-skill` supporting files. The test
explicitly skips when `CENGRID_SOURCE_DIR` is unset and makes no paid browser or model calls.

The original MIT notice is preserved in `skills/taste-skill/LICENSE`, alongside the
unmodified vendored playbook at `skills/taste-skill/references/tasteskill.md`.
