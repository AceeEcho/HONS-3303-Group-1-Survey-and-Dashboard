import { readFileSync } from "node:fs";
import { randomBytes, createHmac } from "node:crypto";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

// Read a JSON array through stdin so plaintext passwords never enter a source file.
const passwords = JSON.parse(readFileSync(0, "utf8"));
if (
  !Array.isArray(passwords) ||
  !passwords.length ||
  passwords.length > 50 ||
  passwords.some(
    (value) => typeof value !== "string" || !value.trim() || value.length > 254,
  )
) {
  throw new Error(
    "Supply a JSON array of 1–50 non-empty creator passwords on stdin.",
  );
}

// Rotating this secret also invalidates previously signed creator sessions.
const sessionSecret = randomBytes(48).toString("base64url");
const hashes = [
  ...new Set(
    passwords.map((value) =>
      createHmac("sha256", sessionSecret)
        .update(value.trim().toLowerCase())
        .digest("base64url"),
    ),
  ),
];
const secrets = JSON.stringify({
  SESSION_SECRET: sessionSecret,
  CREATOR_PASSWORD_HASHES: hashes.join(","),
});

console.log(
  `Configuring ${hashes.length} creator passwords; values stay hidden.`,
);
const wrangler = spawn(
  process.execPath,
  [
    resolve("node_modules/wrangler/bin/wrangler.js"),
    "secret",
    "bulk",
    "--config",
    "wrangler.admin.jsonc",
  ],
  { stdio: ["pipe", "inherit", "inherit"] },
);
wrangler.stdin.end(secrets);
wrangler.on("error", () => {
  console.error("Could not start the Cloudflare secret uploader.");
  process.exitCode = 1;
});
wrangler.on("exit", (code) => {
  process.exitCode = code || 0;
});
