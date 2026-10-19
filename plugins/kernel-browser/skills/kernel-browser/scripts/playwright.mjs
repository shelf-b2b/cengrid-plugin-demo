import { spawn } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { parseArgs } from "node:util";

try {
  const { values } = parseArgs({
    options: {
      session: { type: "string" },
      file: { type: "string" },
      timeout: { type: "string", default: "60" },
    },
  });
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/.test(values.session ?? ""))
    throw new Error("Provide a valid --session");
  if (!values.file || !statSync(values.file).isFile())
    throw new Error("Provide a regular script with --file");
  if (statSync(values.file).size > 1024 * 1024)
    throw new Error("The script exceeds 1 MiB");
  const timeout = Number(values.timeout);
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 300)
    throw new Error("--timeout must be 1-300 seconds");
  const code = readFileSync(values.file, "utf8");
  const child = spawn(
    "kernel",
    [
      "browsers",
      "playwright",
      "execute",
      values.session,
      "--timeout",
      String(timeout),
      "-o",
      "json",
    ],
    {
      detached: true,
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  let stdout = "";
  let stderr = "";
  let failure;
  let signalCode;
  const terminate = (signal) => {
    if (child.pid) {
      try {
        process.kill(-child.pid, signal);
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
  const timer = setTimeout(
    () => {
      failure = "Kernel Playwright execution timed out";
      terminate("SIGKILL");
    },
    (timeout + 15) * 1000,
  );
  for (const [stream, name] of [
    [child.stdout, "stdout"],
    [child.stderr, "stderr"],
  ]) {
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => {
      if (name === "stdout") stdout += chunk;
      else stderr += chunk;
      if (stdout.length + stderr.length > 8 * 1024 * 1024) {
        failure = "Kernel output exceeds 8 MiB";
        terminate("SIGKILL");
      }
    });
  }
  child.stdin.on("error", () => {});
  child.stdin.end(code);
  let exitCode;
  try {
    exitCode = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", resolve);
    });
  } finally {
    clearTimeout(timer);
    process.removeListener("SIGINT", onInterrupt);
    process.removeListener("SIGTERM", onTerminate);
  }
  if (signalCode) process.exitCode = signalCode;
  else {
    if (failure) throw new Error(failure);
    if (exitCode !== 0)
      throw new Error(stderr.trim() || `Kernel exited with code ${exitCode}`);
    const result = JSON.parse(stdout);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result?.success !== true) process.exitCode = 1;
  }
} catch (error) {
  process.stderr.write(
    `${error instanceof SyntaxError ? "Kernel returned invalid JSON" : error.message}\n`,
  );
  process.exitCode = 1;
}
