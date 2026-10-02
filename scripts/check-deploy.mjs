import { readFile } from "node:fs/promises";

const publicConfig = JSON.parse(
  await readFile("wrangler.public.jsonc", "utf8"),
);
const adminConfig = JSON.parse(await readFile("wrangler.admin.jsonc", "utf8"));
const problems = [];
for (const [name, config] of [
  ["public", publicConfig],
  ["admin", adminConfig],
]) {
  if (
    config.vars.APP_MODE !== name ||
    config.vars.ENVIRONMENT !== "production"
  ) {
    problems.push(`${name}: production mode is required`);
  }
  if (!/^[0-9a-f-]{36}$/i.test(config.d1_databases?.[0]?.database_id || "")) {
    problems.push(`${name}: set the real D1 database ID`);
  }
  if (
    config.assets?.run_worker_first !== true ||
    config.preview_urls !== false
  ) {
    problems.push(
      `${name}: Worker-first routing and disabled previews are required`,
    );
  }
}
if (
  publicConfig.d1_databases?.[0]?.database_id !==
    adminConfig.d1_databases?.[0]?.database_id ||
  publicConfig.account_id !== adminConfig.account_id
) {
  problems.push("Both Workers must use the same account and D1 database");
}
if (adminConfig.vars.AUTH_MODE === "shared-password") {
  if (
    !adminConfig.ratelimits?.some((binding) => binding.name === "AUTH_LIMITER")
  ) {
    problems.push("The creator login rate limiter is required");
  }
  // The runtime checks secret values; this report never reads them.
  for (const name of ["SESSION_SECRET", "CREATOR_PASSWORD_HASHES"]) {
    if (name in adminConfig.vars)
      problems.push(`${name} must be a Worker secret`);
  }
} else {
  if (
    !/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(
      adminConfig.vars.ACCESS_TEAM_DOMAIN || "",
    )
  ) {
    problems.push("Set the Cloudflare Access team domain");
  }
  if (
    !adminConfig.vars.ACCESS_AUD ||
    /REPLACE/i.test(adminConfig.vars.ACCESS_AUD) ||
    !adminConfig.vars.ADMIN_EMAILS?.trim()
  ) {
    problems.push(
      "Set the Access application audience and approved creator list",
    );
  }
}
try {
  const url = new URL(adminConfig.vars.PUBLIC_SURVEY_URL);
  if (url.protocol !== "https:" || /REPLACE/i.test(url.hostname))
    throw new Error();
} catch {
  problems.push("Set the real HTTPS public survey URL");
}
if (problems.length) {
  console.error(
    "Deployment is not configured yet:\n- " + problems.join("\n- "),
  );
  process.exit(1);
}
console.log(
  "Production configuration checks passed. Login secrets must also be configured.",
);
