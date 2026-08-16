import { spawn } from "node:child_process";

// The Living Game route serves a built bundle out of public/, so the dev server
// alone is not enough: without the preview watcher the route 404s on a fresh
// checkout and serves stale assets after every edit. Run both, and treat either
// one exiting as the end of the session.
const NPM = process.platform === "win32" ? "npm.cmd" : "npm";
const children = new Map();
let shuttingDown = false;

function start(name, script, { prefix = false } = {}) {
  const child = spawn(NPM, ["run", script], {
    stdio: prefix ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  children.set(name, child);

  if (prefix) {
    for (const stream of [child.stdout, child.stderr]) {
      let buffered = "";
      stream.setEncoding("utf8");
      stream.on("data", (chunk) => {
        buffered += chunk;
        const lines = buffered.split("\n");
        buffered = lines.pop() ?? "";
        for (const line of lines) {
          if (line.trim().length > 0) console.log(`[${name}] ${line}`);
        }
      });
    }
  }

  child.on("exit", (code, signal) => {
    children.delete(name);
    if (shuttingDown) return;
    console.log(`\n[${name}] exited (${signal ?? code}). Stopping the dev session.`);
    shutdown(typeof code === "number" ? code : 1);
  });

  child.on("error", (error) => {
    console.error(`[${name}] failed to start: ${error.message}`);
    shutdown(1);
  });

  return child;
}

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children.values()) child.kill("SIGTERM");
  process.exitCode = code;
  // Give children a moment to close before the runner itself goes away.
  setTimeout(() => process.exit(code), 500).unref();
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => shutdown(0));
}

start("living-game", "dev:living-game", { prefix: true });
start("homebase", "dev:app");
