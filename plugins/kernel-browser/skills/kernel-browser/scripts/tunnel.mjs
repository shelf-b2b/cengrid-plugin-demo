import { spawn } from "node:child_process";
import { lstatSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { parseArgs } from "node:util";

let directory;
let active;
let signalCode;
const terminate = (signal) => {
  if (active?.pid) {
    try {
      process.kill(-active.pid, signal);
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
  }
};
const onInterrupt = () => {
  signalCode = 130;
  terminate("SIGKILL");
};
const onTerminate = () => {
  signalCode = 143;
  terminate("SIGKILL");
};
process.once("SIGINT", onInterrupt);
process.once("SIGTERM", onTerminate);

try {
  const { values } = parseArgs({
    options: { session: { type: "string" }, port: { type: "string" } },
  });
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/.test(values.session ?? ""))
    throw new Error("Provide a valid --session");
  const port = Number(values.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("--port must be 1-65535");
  directory = mkdtempSync(join(tmpdir(), "kernel-tunnel-"));
  active = spawn(
    "kernel",
    ["browsers", "ssh", values.session, "--setup-only", "-o", "json"],
    {
      detached: true,
      env: { ...process.env, TMPDIR: directory },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let stdout = "";
  let stderr = "";
  let failure;
  const timer = setTimeout(() => {
    failure = "Kernel SSH setup timed out";
    terminate("SIGKILL");
  }, 60_000);
  for (const [stream, name] of [
    [active.stdout, "stdout"],
    [active.stderr, "stderr"],
  ]) {
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => {
      if (name === "stdout") stdout += chunk;
      else stderr += chunk;
      if (stdout.length + stderr.length > 1024 * 1024) {
        failure = "Kernel SSH setup output exceeds 1 MiB";
        terminate("SIGKILL");
      }
    });
  }
  let setupCode;
  try {
    setupCode = await new Promise((resolve, reject) => {
      active.once("error", reject);
      active.once("close", resolve);
    });
  } finally {
    clearTimeout(timer);
  }
  if (!signalCode) {
    if (failure) throw new Error(failure);
    if (setupCode !== 0)
      throw new Error(
        stderr.trim() || `Kernel SSH setup exited with code ${setupCode}`,
      );
    const setup = JSON.parse(stdout);
    if (
      !/^(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+(?:onkernel\.(?:app|com)|kernel\.sh)$/.test(
        setup.vm_domain ?? "",
      )
    )
      throw new Error("Kernel returned an invalid browser VM domain");
    if (
      setup.proxy_command !== `websocat --binary wss://${setup.vm_domain}:2222`
    )
      throw new Error("Kernel returned an unexpected SSH proxy command");
    if (
      typeof setup.ssh_key_file !== "string" ||
      dirname(setup.ssh_key_file) !== directory ||
      !basename(setup.ssh_key_file).startsWith("kernel-ssh-") ||
      !lstatSync(setup.ssh_key_file).isFile()
    )
      throw new Error("Kernel returned an invalid temporary SSH key");
    active = spawn(
      "ssh",
      [
        "-N",
        "-T",
        "-o",
        "BatchMode=yes",
        "-o",
        "ExitOnForwardFailure=yes",
        "-o",
        "ServerAliveInterval=15",
        "-o",
        "ServerAliveCountMax=3",
        "-o",
        "ConnectTimeout=20",
        "-o",
        `ProxyCommand=${setup.proxy_command}`,
        "-o",
        "StrictHostKeyChecking=no",
        "-o",
        "UserKnownHostsFile=/dev/null",
        "-o",
        "LogLevel=ERROR",
        "-i",
        setup.ssh_key_file,
        "-R",
        `127.0.0.1:${port}:127.0.0.1:${port}`,
        "root@localhost",
      ],
      { detached: true, stdio: ["ignore", "inherit", "inherit"] },
    );
    process.exitCode = await new Promise((resolve, reject) => {
      active.once("error", reject);
      active.once("close", (code) => resolve(code ?? 1));
    });
  }
} catch (error) {
  if (!signalCode)
    process.stderr.write(
      `${error instanceof SyntaxError ? "Kernel returned invalid JSON" : error.message}\n`,
    );
  process.exitCode = 1;
} finally {
  if (directory) rmSync(directory, { recursive: true, force: true });
  process.removeListener("SIGINT", onInterrupt);
  process.removeListener("SIGTERM", onTerminate);
  if (signalCode) process.exitCode = signalCode;
}
