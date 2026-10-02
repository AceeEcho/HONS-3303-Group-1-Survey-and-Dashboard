import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

// Each browser run gets its own local D1 database. No production data is used.
const stateDirectory = resolve(".wrangler", "browser-qa", randomUUID());
const wrangler = resolve("node_modules", "wrangler", "bin", "wrangler.js");
const vite = resolve("node_modules", "vite", "bin", "vite.js");

function run(script, args) {
  const result = spawnSync(process.execPath, [script, ...args], {
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

run(vite, ["build"]);
run(wrangler, [
  "d1",
  "migrations",
  "apply",
  "DB",
  "--local",
  "--config",
  "wrangler.local.jsonc",
  "--persist-to",
  stateDirectory,
]);

const server = spawn(
  process.execPath,
  [
    wrangler,
    "dev",
    "--config",
    "wrangler.local.jsonc",
    "--ip",
    "127.0.0.1",
    "--port",
    "8787",
    "--inspector-port",
    "9230",
    "--persist-to",
    stateDirectory,
  ],
  { stdio: "inherit" },
);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.kill(signal));
}
server.on("exit", (code) => process.exit(code || 0));
