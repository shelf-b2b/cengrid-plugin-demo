import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const sourceDir = process.env.CENGRID_SOURCE_DIR;
const options = {
  skip: sourceDir
    ? false
    : "Set CENGRID_SOURCE_DIR to a CenGrid checkout with its dependencies installed",
};
const repositoryDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pluginPath = "plugins/kernel-browser";
const pluginDir = join(repositoryDir, pluginPath);
const ORG = "org:default-org";
const TEAM = "team:qa";
const SIBLING = "team:other";
const run = promisify(execFile);
let imports;

function core() {
  return (imports ??= Promise.all(
    [
      ["src/capabilities/plugin-catalog.ts", "parsePluginCatalog"],
      ["src/capabilities/plugin-service.ts", "createPluginService"],
      ["src/persistence/durable-map.ts", "createMemoryMap"],
      ["src/persistence/advisory-lock.ts", "createMemoryAdvisoryLock"],
      ["src/skills/skill-store.ts", "createSkillStore"],
      ["src/skills/skill-bundle-store.ts", "createSkillBundleStore"],
      ["src/agents/agent-store.ts", "createAgentStore"],
      ["src/instructions/instruction-store.ts", "createInstructionStore"],
      [
        "src/environments/environment-definition-store.ts",
        "createEnvironmentDefinitionStore",
      ],
      ["src/connectors/connection-mcp.ts", "createConnectionMcpStore"],
      ["src/connectors/connection-store.ts", "createConnectionStore"],
      ["src/credentials/keychain.ts", "createKeychain"],
      ["src/connectors/connector-client-store.ts", "deriveConnectorKey"],
      [
        "src/capabilities/capability-override-store.ts",
        "createCapabilityOverrideStore",
      ],
      ["src/model/model-catalog.ts", "selectableModelCatalog"],
    ].map(async ([path, name]) => [
      name,
      (await import(pathToFileURL(join(resolve(sourceDir), path)).href))[name],
    ]),
  ).then(Object.fromEntries));
}

async function fetchedPlugin(commit = "recorded-one") {
  async function files(directory, prefix) {
    const entries = await readdir(directory, { withFileTypes: true });
    const groups = await Promise.all(
      entries
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(async (entry) => {
          const path = `${prefix}/${entry.name}`;
          const absolute = join(directory, entry.name);
          if (entry.isDirectory()) return files(absolute, path);
          assert.ok(
            entry.isFile(),
            `Plugin artifact must be a regular file: ${path}`,
          );
          const bytes = await readFile(absolute);
          const text = bytes.toString("utf8");
          const binary = bytes.includes(0) || !Buffer.from(text).equals(bytes);
          return [{ path, text, binary, ...(binary ? { bytes } : {}) }];
        }),
    );
    return groups.flat();
  }
  return { commit, files: await files(pluginDir, pluginPath) };
}

async function hydrateModels(c) {
  const models = await c.selectableModelCatalog(async (url) => {
    assert.equal(new URL(url).hostname, "openrouter.ai");
    return Response.json({
      data: [
        {
          id: "anthropic/claude-haiku-5.5",
          name: "Anthropic: Claude Haiku 5.5",
          context_length: 1_000_000,
          top_provider: { max_completion_tokens: 128_000 },
          pricing: { prompt: "0.0000001", completion: "0.0000005" },
          architecture: { input_modalities: ["text", "image", "file"] },
          supported_parameters: [
            "include_reasoning",
            "max_completion_tokens",
            "max_tokens",
            "reasoning",
            "reasoning_effort",
            "response_format",
            "stop",
            "structured_outputs",
            "tool_choice",
            "tools",
            "verbosity",
          ],
        },
      ],
    });
  });
  assert.ok(
    models.some(
      (model) =>
        model.id === "anthropic/claude-haiku-5.5" &&
        model.provider === "openrouter",
    ),
  );
}

async function fixture() {
  const c = await core();
  let repo = await fetchedPlugin();
  const calls = [];
  const credentials = c.createMemoryMap();
  const keychain = c.createKeychain({
    creds: credentials,
    grants: c.createMemoryMap(),
    asks: c.createMemoryMap(),
    key: c.deriveConnectorKey("kernel-plugin-catalog-test", "keychain"),
  });
  const connections = c.createConnectionStore({
    backing: c.createMemoryMap(),
    keychain,
    lock: c.createMemoryAdvisoryLock(),
    orgScopeId: ORG,
  });
  const deps = {
    backing: c.createMemoryMap(),
    lock: c.createMemoryAdvisoryLock(),
    fetcher: {
      fetch: async (source) => {
        calls.push(source);
        return structuredClone(repo);
      },
      resolveRef: async () => repo.commit,
    },
    skills: c.createSkillStore(),
    bundles: c.createSkillBundleStore(),
    agents: c.createAgentStore(),
    instructions: c.createInstructionStore(c.createMemoryMap()),
    environmentDefinitions: c.createEnvironmentDefinitionStore(
      c.createMemoryMap(),
    ),
    connections,
    servers: c.createConnectionMcpStore(connections, ORG),
    overrides: c.createCapabilityOverrideStore(c.createMemoryMap()),
    orgScopeId: ORG,
    runtime: async () => ({ harnessId: "pi", modelId: "claude-sonnet-5" }),
    hydrateModels: () => hydrateModels(c),
  };
  const service = c.createPluginService(deps);
  const plugin = await service.import(
    { url: "shelf-b2b/cengrid-plugin-demo", path: pluginPath },
    "alice",
  );
  return {
    deps,
    service,
    plugin,
    credentials,
    calls,
    nextCommit: () => {
      repo = { ...repo, commit: "recorded-two" };
    },
    install: (item, configuration) =>
      service.install({
        pluginId: plugin.id,
        commit: plugin.commit,
        kind: item.kind,
        key: item.key,
        scopeId: TEAM,
        actor: "alice",
        configuration,
      }),
  };
}

async function assertSiblingUnconfigured(deps) {
  for (const name of ["kernel-browser", "popular-web-designs", "taste-skill"])
    assert.equal((await deps.skills.resolve(name, [SIBLING, ORG])).skill, null);
  assert.deepEqual(await deps.agents.forScopes([SIBLING, ORG]), []);
  assert.deepEqual(await deps.instructions.forScopes([SIBLING, ORG]), []);
  assert.deepEqual(
    await deps.environmentDefinitions.forScopes([SIBLING, ORG]),
    [],
  );
  assert.equal(
    await deps.connections.resolve("kernel-browser", [SIBLING, ORG]),
    null,
  );
}

test(
  "actual Kernel plugin parses all optional capabilities and preserves vendored design assets",
  options,
  async () => {
    const c = await core();
    await hydrateModels(c);
    const catalog = c.parsePluginCatalog(
      await fetchedPlugin(),
      pluginPath,
      "kernel-browser",
    );
    assert.deepEqual(catalog.issues, []);
    assert.deepEqual(
      catalog.items.filter((item) => item.unavailableReason),
      [],
    );
    const kinds = catalog.items.map((item) => item.kind).sort();
    assert.deepEqual(kinds, [
      "agent",
      "connection",
      "environment",
      "instruction",
      "skill",
      "skill",
      "skill",
    ]);
    const design = catalog.items.find(
      (item) => item.kind === "skill" && item.key === "popular-web-designs",
    );
    const templates = design.manifest.files.filter((file) =>
      file.path.startsWith("templates/"),
    );
    assert.equal(templates.length, 54);
    for (const file of templates)
      assert.equal(
        file.content,
        await readFile(
          join(pluginDir, "skills/popular-web-designs", file.path),
          "utf8",
        ),
      );
    const taste = catalog.items.find(
      (item) => item.kind === "skill" && item.key === "taste-skill",
    );
    for (const path of ["LICENSE", "references/tasteskill.md"])
      assert.equal(
        taste.manifest.files.find((file) => file.path === path)?.content,
        await readFile(join(pluginDir, "skills/taste-skill", path), "utf8"),
      );
    assert.match(
      taste.manifest.files.find((file) => file.path === "LICENSE").content,
      /MIT License/,
    );
  },
);

test(
  "import is inactive, team installation isolates encrypted credentials and resync retains local choices",
  options,
  async () => {
    const f = await fixture();
    for (const store of [
      f.deps.skills,
      f.deps.agents,
      f.deps.instructions,
      f.deps.environmentDefinitions,
      f.deps.connections,
    ])
      assert.deepEqual(await store.list(), []);
    assert.deepEqual(await f.credentials.all(), []);
    const connectionItem = f.plugin.items.find(
      (item) => item.kind === "connection",
    );
    await assert.rejects(f.install(connectionItem), /a credential is required/);
    const secret = "team-qa-kernel-private-token";
    for (const item of f.plugin.items)
      await f.install(
        item,
        item.kind === "connection" ? { token: secret } : undefined,
      );
    await assertSiblingUnconfigured(f.deps);
    const source = {
      kind: "plugin",
      id: f.plugin.id,
      name: f.plugin.name,
      commit: f.plugin.commit,
    };
    for (const skill of await f.deps.skills.list()) {
      assert.equal(skill.scopeId, TEAM);
      assert.equal(skill.createdBy, `plugin:${f.plugin.id}`);
      assert.deepEqual(skill.source, source);
      assert.ok(skill.approvals.includes("alice"));
      assert.ok(f.deps.skills.verify(skill));
      assert.equal(
        (await f.deps.skills.resolve(skill.manifest.name, [TEAM, ORG])).skill
          .id,
        skill.id,
      );
    }
    for (const store of [
      f.deps.agents,
      f.deps.instructions,
      f.deps.environmentDefinitions,
    ]) {
      const rows = await store.forScopes([TEAM, ORG]);
      assert.equal(rows.length, 1);
      assert.deepEqual(rows[0].source, source);
    }
    const connection = await f.deps.connections.get(connectionItem.key, TEAM);
    assert.ok(connection.credentialRef);
    assert.deepEqual(await f.deps.connections.secrets(connection), {
      token: secret,
    });
    assert.doesNotMatch(
      JSON.stringify([
        await f.service.get(f.plugin.id),
        await f.deps.connections.list(),
        await f.deps.servers.list(),
      ]),
      new RegExp(secret),
    );
    const storedCredentials = await f.credentials.all();
    assert.equal(storedCredentials.length, 1);
    assert.ok(storedCredentials[0].secretEnc);
    assert.doesNotMatch(JSON.stringify(storedCredentials), new RegExp(secret));
    await f.deps.connections.put({ ...connection, enabled: false });
    const disabledSkill = {
      scopeId: TEAM,
      kind: "skill",
      key: "kernel-browser",
      state: "off",
      updatedBy: "alice",
      updatedAt: 1,
    };
    await f.deps.overrides.put(disabledSkill);
    const localOverrides = await f.deps.overrides.forScopes([TEAM]);
    f.nextCommit();
    const latest = await f.service.resync(f.plugin.id, "bob");
    assert.equal(latest.createdBy, "alice");
    assert.equal(latest.updatedBy, "bob");
    assert.equal(f.calls.at(-1).createdBy, "bob");
    assert.equal(latest.commit, "recorded-two");
    assert.deepEqual(await f.deps.overrides.forScopes([TEAM]), localOverrides);
    const fresh = await f.deps.connections.get(connectionItem.key, TEAM);
    assert.equal(fresh.enabled, false);
    assert.equal(fresh.source.commit, latest.commit);
    assert.deepEqual(await f.deps.connections.secrets(fresh), {
      token: secret,
    });
    for (const skill of await f.deps.skills.list()) {
      assert.equal(skill.source.commit, latest.commit);
      assert.equal(skill.createdBy, `plugin:${f.plugin.id}`);
    }
    await assertSiblingUnconfigured(f.deps);
  },
);

test(
  "connection helper uses the real scoped core HTTP transport to save a screenshot",
  options,
  async (t) => {
    const f = await fixture();
    await f.install(
      f.plugin.items.find((item) => item.kind === "connection"),
      { token: "http-team-kernel-token" },
    );
    const load = async (path) =>
      import(pathToFileURL(join(resolve(sourceDir), path)).href);
    const [
      { createInsecureTestServer },
      { buildApp },
      { mintCapabilityToken },
      { testConfig, TEST_CAPABILITY_SECRET },
    ] = await Promise.all([
      load("src/api/server.ts"),
      load("src/wiring.ts"),
      load("src/auth/capability-token.ts"),
      load("test/support/test-config.ts"),
    ]);
    const directory = await mkdtemp(join(tmpdir(), "kernel-plugin-http-"));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const built = buildApp(
      testConfig({
        harness: "mock",
        sandboxBackend: "local",
        dataDir: directory,
      }),
    );
    t.after(() => built.mcpToolService.close());
    const forwarded = [];
    const screenshot = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9RkAAAAASUVORK5CYII=",
      "base64",
    );
    const server = createInsecureTestServer(built.app, {
      connections: f.deps.connections,
      config: built.config,
      admin: built.admin,
      identity: built.identity,
      capabilitySecret: TEST_CAPABILITY_SECRET,
      auditLog: built.auditLog,
      connectionFetch: async (url, init) => {
        forwarded.push({ url, ...init });
        return Response.json({
          success: true,
          result: screenshot.toString("base64"),
        });
      },
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const api = `http://127.0.0.1:${server.address().port}`;
    const token = (team) =>
      mintCapabilityToken(
        {
          actorId: "alice",
          scopeId: "personal:alice",
          capabilityScopes: ["personal:alice", team, ORG],
          liveActor: true,
          exp: Date.now() + 60_000,
        },
        TEST_CAPABILITY_SECRET,
      );
    const request = join(directory, "request.json");
    const output = join(directory, "evidence/screenshot.png");
    const body = {
      code: "return (await page.screenshot()).toString('base64')",
      timeout_sec: 20,
    };
    await writeFile(request, JSON.stringify(body));
    const command = [
      join(pluginDir, "skills/kernel-browser/scripts/connection.mjs"),
      "POST",
      "/browsers/test-session/playwright/execute",
      `--json=${request}`,
      `--screenshot=${output}`,
    ];
    const result = await run(process.execPath, command, {
      env: {
        ...process.env,
        AGENT_API_URL: api,
        AGENT_API_TOKEN: await token(TEAM),
      },
      timeout: 20_000,
    });
    assert.equal(result.stderr, "");
    assert.deepEqual(JSON.parse(result.stdout), { saved: output });
    assert.deepEqual(await readFile(output), screenshot);
    assert.equal((await stat(output)).mode & 0o777, 0o600);
    assert.equal(forwarded.length, 1);
    assert.equal(
      forwarded[0].url,
      "https://api.onkernel.com/browsers/test-session/playwright/execute",
    );
    assert.equal(
      forwarded[0].headers.authorization,
      "Bearer http-team-kernel-token",
    );
    assert.equal(forwarded[0].headers["x-agent-capability"], undefined);
    assert.deepEqual(JSON.parse(forwarded[0].body), body);
    await assert.rejects(
      run(process.execPath, command, {
        env: {
          ...process.env,
          AGENT_API_URL: api,
          AGENT_API_TOKEN: await token(SIBLING),
        },
        timeout: 20_000,
      }),
      (error) => error.code === 1 && /HTTP 404/.test(error.stderr),
    );
    assert.equal(forwarded.length, 1);
  },
);
