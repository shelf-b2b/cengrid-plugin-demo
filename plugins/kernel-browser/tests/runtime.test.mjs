import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout } from "node:timers/promises";

const scripts = fileURLToPath(
  new URL("../skills/kernel-browser/scripts/", import.meta.url),
);

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), "kernel-runtime-test-"));
  const bin = join(dir, "bin");
  mkdirSync(bin);
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(
    join(bin, "kernel"),
    `#!${process.execPath}
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const args = process.argv.slice(2);
writeFileSync(process.env.MOCK_KERNEL_ARGS, JSON.stringify(args));
if (args.includes("playwright")) {
  writeFileSync(process.env.MOCK_KERNEL_INPUT, readFileSync(0));
  console.log(JSON.stringify({success: process.env.MOCK_MODE !== "playwright-fail", result: {title: "App"}, error: process.env.MOCK_MODE === "playwright-fail" ? "Missing expected confirmation" : undefined}));
} else {
  const key = join(process.env.TMPDIR, "kernel-ssh-session-test");
  writeFileSync(key, "ephemeral-test-key", { mode: 0o600 });
  writeFileSync(process.env.MOCK_KEY_PATH, key);
  if (process.env.MOCK_MODE === "setup-wait") setInterval(() => {}, 1000);
  else console.log(JSON.stringify({session_id: "session", vm_domain: "browser.onkernel.app", ssh_key_file: key, proxy_command: process.env.MOCK_MODE === "bad-proxy" ? "websocat; touch /tmp/injected" : "websocat --binary wss://browser.onkernel.app:2222"}));
}
`,
    { mode: 0o755 },
  );
  writeFileSync(
    join(bin, "ssh"),
    `#!${process.execPath}
import { writeFileSync } from "node:fs";
writeFileSync(process.env.MOCK_SSH_ARGS, JSON.stringify({args: process.argv.slice(2), pid: process.pid}));
if (process.env.MOCK_MODE === "ssh-fail") process.exit(23);
setInterval(() => {}, 1000);
`,
    { mode: 0o755 },
  );
  const env = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    MOCK_KERNEL_ARGS: join(dir, "kernel-args.json"),
    MOCK_KERNEL_INPUT: join(dir, "kernel-input.txt"),
    MOCK_KEY_PATH: join(dir, "key-path.txt"),
    MOCK_SSH_ARGS: join(dir, "ssh-args.json"),
  };
  delete env.KERNEL_API_KEY;
  delete env.AGENT_API_URL;
  delete env.AGENT_API_TOKEN;
  return { dir, env };
}

function run(script, args, env) {
  const child = spawn(process.execPath, [join(scripts, script), ...args], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const done = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, stdout, stderr }));
  });
  return { child, done };
}

async function until(predicate) {
  const deadline = Date.now() + 5000;
  while (!predicate()) {
    if (Date.now() > deadline)
      throw new Error("Timed out waiting for subprocess");
    await setTimeout(10);
  }
}

async function core(t, handler) {
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    const result = handler(req, JSON.parse(body));
    res.writeHead(result.status ?? 200, { "content-type": "application/json" });
    res.end(JSON.stringify(result.body));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  );
  return `http://127.0.0.1:${server.address().port}`;
}

test("scoped connection requests preserve JSON and save signed session details privately", async (t) => {
  const { dir, env } = fixture(t);
  const payload = {
    name: "qa-session",
    telemetry: { browser: { console: { enabled: true } } },
  };
  const expected = {
    session_id: "session",
    browser_live_view_url:
      "https://browser.onkernel.app/live?jwt=test-signed-view",
  };
  env.AGENT_API_URL = await core(t, (req, request) => {
    assert.equal(req.url, "/v1/connections/team-kernel/call");
    assert.equal(req.headers["x-agent-capability"], "scoped-test-token");
    assert.equal(req.headers.authorization, undefined);
    assert.deepEqual(request, {
      method: "POST",
      path: "/browsers",
      body: JSON.stringify(payload),
    });
    return {
      body: {
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(expected),
      },
    };
  });
  env.AGENT_API_TOKEN = "scoped-test-token";
  const input = join(dir, "payload.json");
  const output = join(dir, "artifacts", "session.json");
  writeFileSync(input, JSON.stringify(payload));
  const result = await run(
    "connection.mjs",
    [
      "POST",
      "/browsers",
      "--json",
      input,
      "--connection",
      "team-kernel",
      "--output",
      output,
    ],
    env,
  ).done;
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(JSON.parse(readFileSync(output, "utf8")), expected);
  assert.equal(statSync(output).mode & 0o777, 0o600);
  assert.equal(statSync(dirname(output)).mode & 0o777, 0o700);
  assert.ok(!result.stdout.includes("test-signed-view"));
  assert.ok(!`${result.stdout}${result.stderr}`.includes("scoped-test-token"));
});

test("connection failures include outer authorization, upstream status, and unsuccessful Playwright execution", async (t) => {
  for (const failure of ["authorization", "upstream", "playwright"]) {
    await t.test(failure, async (t) => {
      const { env } = fixture(t);
      env.AGENT_API_TOKEN = "scoped-test-token";
      env.AGENT_API_URL = await core(t, () =>
        failure === "authorization"
          ? { status: 401, body: { error: "expired" } }
          : {
              body: {
                status: failure === "upstream" ? 403 : 200,
                body: JSON.stringify({
                  success: false,
                  error: "Expected flow failed",
                }),
              },
            },
      );
      const result = await run(
        "connection.mjs",
        ["POST", "/browsers/session/playwright/execute"],
        env,
      ).done;
      assert.equal(result.code, 1);
      assert.match(
        result.stderr,
        {
          authorization: /HTTP 401/,
          upstream: /HTTP 403/,
          playwright: /Playwright execution failed/,
        }[failure],
      );
      assert.ok(
        !`${result.stdout}${result.stderr}`.includes("scoped-test-token"),
      );
    });
  }
});

test("connection screenshots decode binary bytes without printing base64", async (t) => {
  const { dir, env } = fixture(t);
  const image = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
  env.AGENT_API_TOKEN = "scoped-test-token";
  env.AGENT_API_URL = await core(t, () => ({
    body: {
      status: 200,
      body: JSON.stringify({ success: true, result: image.toString("base64") }),
    },
  }));
  const output = join(dir, "artifacts", "screenshot.png");
  const result = await run(
    "connection.mjs",
    ["POST", "/browsers/session/playwright/execute", "--screenshot", output],
    env,
  ).done;
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(readFileSync(output), image);
  assert.equal(statSync(output).mode & 0o777, 0o600);
  assert.ok(!result.stdout.includes(image.toString("base64")));
});

test("connection Playwright timeouts fit the scoped broker and reject longer calls before transport", async (t) => {
  const { dir, env } = fixture(t);
  let requests = 0;
  env.AGENT_API_TOKEN = "scoped-test-token";
  env.AGENT_API_URL = await core(t, (_req, request) => {
    requests++;
    assert.equal(JSON.parse(request.body).timeout_sec, 20);
    return {
      body: {
        status: 200,
        body: JSON.stringify({ success: true, result: "App" }),
      },
    };
  });
  const input = join(dir, "flow.json");
  for (const timeout of [undefined, 20, 21, 0, "20", null]) {
    writeFileSync(
      input,
      JSON.stringify({
        code: "return await page.title();",
        ...(timeout === undefined ? {} : { timeout_sec: timeout }),
      }),
    );
    const result = await run(
      "connection.mjs",
      ["POST", "/browsers/session/playwright/execute", "--json", input],
      env,
    ).done;
    if (timeout === undefined || timeout === 20)
      assert.equal(result.code, 0, result.stderr);
    else {
      assert.equal(result.code, 1);
      assert.match(
        result.stderr,
        /timeout_sec <= 20; split the flow or use the CLI/,
      );
    }
  }
  assert.equal(requests, 2);
});

test("environment warm-up cleans installer archives without changing its source directory", async (t) => {
  const { dir, env } = fixture(t);
  const source = join(dir, "source");
  mkdirSync(source);
  env.MOCK_WARM_LOG = join(dir, "warm-paths.txt");
  writeFileSync(
    join(dir, "bin", "kernel"),
    `#!${process.execPath}
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
mkdirSync("archive-test");
writeFileSync("archive-test/tool.tar.gz", "generated binary archive");
appendFileSync(process.env.MOCK_WARM_LOG, process.cwd() + "\\n");
console.log("kernel 0.49.0");
`,
    { mode: 0o755 },
  );
  const setup = fileURLToPath(
    new URL("../environments/kernel-cli/setup.sh", import.meta.url),
  );
  for (let i = 0; i < 2; i++) {
    const child = spawn("sh", [setup], { cwd: source, env, stdio: "ignore" });
    const code = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", resolve);
    });
    assert.equal(code, 0);
  }
  assert.deepEqual(readdirSync(source), []);
  const paths = readFileSync(env.MOCK_WARM_LOG, "utf8").trim().split("\n");
  assert.equal(paths.length, 2);
  for (const path of paths) assert.equal(existsSync(path), false);
});

test("CLI Playwright passes script bytes over stdin and treats success=false as failure", async (t) => {
  const { dir, env } = fixture(t);
  const input = join(dir, "flow file.ts");
  const code = 'return { text: "$(touch /tmp/not-executed)" };';
  writeFileSync(input, code);
  for (const mode of ["playwright-pass", "playwright-fail"]) {
    const result = await run(
      "playwright.mjs",
      ["--session", "session", "--file", input, "--timeout", "12"],
      { ...env, MOCK_MODE: mode },
    ).done;
    assert.equal(
      result.code,
      mode === "playwright-fail" ? 1 : 0,
      result.stderr,
    );
    assert.equal(readFileSync(env.MOCK_KERNEL_INPUT, "utf8"), code);
    assert.deepEqual(JSON.parse(readFileSync(env.MOCK_KERNEL_ARGS, "utf8")), [
      "browsers",
      "playwright",
      "execute",
      "session",
      "--timeout",
      "12",
      "-o",
      "json",
    ]);
  }
  const invalid = await run(
    "playwright.mjs",
    ["--session", "session;bad", "--file", input],
    env,
  ).done;
  assert.equal(invalid.code, 1);
  assert.match(invalid.stderr, /valid --session/);
});

test("tunnel forwards only the selected local port and removes its private key on termination", async (t) => {
  const { env } = fixture(t);
  const running = run(
    "tunnel.mjs",
    ["--session", "session", "--port", "3000"],
    env,
  );
  t.after(() => running.child.kill("SIGKILL"));
  await until(() => existsSync(env.MOCK_SSH_ARGS));
  const { args, pid } = JSON.parse(readFileSync(env.MOCK_SSH_ARGS, "utf8"));
  assert.ok(args.includes("-N") && args.includes("-T"));
  assert.ok(args.includes("ExitOnForwardFailure=yes"));
  assert.ok(
    args.includes(
      "ProxyCommand=websocat --binary wss://browser.onkernel.app:2222",
    ),
  );
  assert.equal(args[args.indexOf("-R") + 1], "127.0.0.1:3000:127.0.0.1:3000");
  const key = readFileSync(env.MOCK_KEY_PATH, "utf8");
  assert.equal(args[args.indexOf("-i") + 1], key);
  assert.equal(statSync(key).mode & 0o777, 0o600);
  running.child.kill("SIGTERM");
  assert.equal((await running.done).code, 143);
  assert.equal(existsSync(dirname(key)), false);
  assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
});

test("tunnel cleans up keys when interrupted during setup or when the proxy command is invalid", async (t) => {
  for (const mode of ["setup-wait", "bad-proxy", "ssh-fail"]) {
    await t.test(mode, async (t) => {
      const { env } = fixture(t);
      const running = run(
        "tunnel.mjs",
        ["--session", "session", "--port", "3000"],
        { ...env, MOCK_MODE: mode },
      );
      t.after(() => running.child.kill("SIGKILL"));
      if (mode === "setup-wait") {
        await until(() => existsSync(env.MOCK_KEY_PATH));
        running.child.kill("SIGINT");
      }
      const result = await running.done;
      assert.equal(
        result.code,
        { "setup-wait": 130, "ssh-fail": 23, "bad-proxy": 1 }[mode],
        result.stderr,
      );
      const key = readFileSync(env.MOCK_KEY_PATH, "utf8");
      assert.equal(existsSync(dirname(key)), false);
      if (mode === "bad-proxy")
        assert.equal(existsSync(env.MOCK_SSH_ARGS), false);
    });
  }
});
