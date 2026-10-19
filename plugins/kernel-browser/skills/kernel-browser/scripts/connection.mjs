import {
  closeSync,
  fchmodSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";

function save(path, data) {
  mkdirSync(dirname(resolve(path)), { recursive: true, mode: 0o700 });
  const fd = openSync(path, "w", 0o600);
  try {
    fchmodSync(fd, 0o600);
    writeFileSync(fd, data);
  } finally {
    closeSync(fd);
  }
}

try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      json: { type: "string" },
      output: { type: "string" },
      screenshot: { type: "string" },
      connection: { type: "string", default: "kernel-browser" },
    },
  });
  const [method, path] = positionals;
  if (
    positionals.length !== 2 ||
    !/^(GET|HEAD|POST|PUT|PATCH|DELETE)$/.test(method ?? "")
  )
    throw new Error("Provide METHOD /path");
  if (!path?.startsWith("/") || path.startsWith("//") || /[\\\r\n#]/.test(path))
    throw new Error("Provide a relative API path beginning with /");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/.test(values.connection))
    throw new Error("Invalid --connection");
  if (values.output && values.screenshot)
    throw new Error("Choose --output or --screenshot");
  if (!process.env.AGENT_API_URL || !process.env.AGENT_API_TOKEN)
    throw new Error(
      "Run this helper through CenGrid execute with its scoped API credentials",
    );
  const base = new URL(process.env.AGENT_API_URL);
  if (
    !/^https?:$/.test(base.protocol) ||
    base.username ||
    base.password ||
    base.search ||
    base.hash
  )
    throw new Error("Invalid AGENT_API_URL");
  const isPlaywright = /\/playwright\/execute$/.test(path.split("?")[0]);
  let payload = values.json
    ? JSON.parse(readFileSync(values.json, "utf8"))
    : undefined;
  if (isPlaywright) {
    if (payload === undefined) payload = {};
    if (!payload || typeof payload !== "object" || Array.isArray(payload))
      throw new Error("Playwright calls require a JSON object");
    const timeout =
      payload.timeout_sec === undefined ? 20 : payload.timeout_sec;
    if (!Number.isInteger(timeout) || timeout < 1 || timeout > 20)
      throw new Error(
        "Connection calls require timeout_sec <= 20; split the flow or use the CLI",
      );
    payload.timeout_sec = timeout;
  }
  const body = payload === undefined ? undefined : JSON.stringify(payload);
  const response = await fetch(
    `${base.toString().replace(/\/$/, "")}/v1/connections/${encodeURIComponent(values.connection)}/call`,
    {
      method: "POST",
      headers: {
        "x-agent-capability": process.env.AGENT_API_TOKEN,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        method,
        path,
        ...(body === undefined ? {} : { body }),
      }),
      signal: AbortSignal.timeout(35_000),
      redirect: "error",
    },
  );
  if (!response.ok)
    throw new Error(
      `CenGrid connection request failed (HTTP ${response.status})`,
    );
  const upstream = await response.json();
  if (
    !Number.isInteger(upstream.status) ||
    upstream.status < 200 ||
    upstream.status >= 300
  )
    throw new Error(`Kernel request failed (HTTP ${upstream.status})`);
  if (typeof upstream.body !== "string")
    throw new Error("CenGrid returned an invalid connection response");
  const result = upstream.body.trim() ? JSON.parse(upstream.body) : null;
  if (values.screenshot) {
    if (
      !isPlaywright ||
      result?.success !== true ||
      typeof result.result !== "string" ||
      !result.result ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
        result.result,
      )
    )
      throw new Error(
        "--screenshot requires a successful Playwright response returning base64 image bytes",
      );
    save(values.screenshot, Buffer.from(result.result, "base64"));
    process.stdout.write(`${JSON.stringify({ saved: values.screenshot })}\n`);
  } else {
    const json = `${JSON.stringify(result, null, 2)}\n`;
    if (values.output) {
      save(values.output, json);
      process.stdout.write(`${JSON.stringify({ saved: values.output })}\n`);
    } else process.stdout.write(json);
    if (isPlaywright && result?.success !== true)
      throw new Error("Kernel Playwright execution failed");
  }
} catch (error) {
  process.stderr.write(
    `${error instanceof SyntaxError ? "Invalid JSON in Kernel request or response" : error.message}\n`,
  );
  process.exitCode = 1;
}
