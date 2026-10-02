import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Read credentials only from stdin. Never log passwords, cookies or private data.
const passwords = JSON.parse(readFileSync(0, "utf8"));
const creator = "https://dashboard-hons3303survey.echowake.workers.dev";
const publicSite = "https://survey-hons3303survey.echowake.workers.dev";
const write = (path, payload, extra = {}) =>
  fetch(creator + path, {
    method: "POST",
    headers: {
      Origin: creator,
      "Content-Type": "application/json",
      "X-Survey-Request": "1",
      ...extra,
    },
    body: JSON.stringify(payload),
  });

assert.equal((await fetch(publicSite)).status, 200);
const publicSurvey = await fetch(publicSite + "/api/public/survey");
assert.equal(publicSurvey.status, 200);
assert.ok(["draft", "open", "paused"].includes((await publicSurvey.json()).status));
for (const path of [
  "/admin",
  "/api/admin/survey",
  "/api/admin/responses",
  "/api/admin/export.csv",
]) {
  assert.equal((await fetch(publicSite + path)).status, 404);
}
for (const path of [
  "/api/admin/survey",
  "/api/admin/responses",
  "/api/admin/export.csv",
]) {
  assert.equal((await fetch(creator + path)).status, 401);
  assert.equal(
    (
      await fetch(creator + path, {
        headers: {
          Cookie: "__Host-fieldwork_creator=forged",
          "Cf-Access-Authenticated-User-Email": "forged",
        },
      })
    ).status,
    401,
  );
}
assert.equal(
  (await write("/api/auth/login", {}, { Origin: "https://other.example.test" }))
    .status,
  403,
);
for (const password of passwords) {
  const login = await write("/api/auth/login", { password });
  assert.equal(login.status, 200, "Approved creator login must succeed");
  assert.equal(await login.text(), "{}");
  const cookie = login.headers.get("Set-Cookie");
  assert.match(
    cookie,
    /Secure; HttpOnly; SameSite=Strict; Path=\/; Max-Age=28800/,
  );
  const headers = { Cookie: cookie.split(";")[0] };
  const response = await fetch(creator + "/api/admin/survey", { headers });
  assert.equal(response.status, 200);
  const survey = await response.json();
  // The study may have changed since deployment; verification must never alter it.
  assert.ok(Array.isArray(survey.draft.questions));
  assert.ok(Array.isArray(survey.versions));
  assert.ok(Number.isInteger(survey.response_count));
  assert.equal(survey.user.authentication, "shared-password");
  const responses = await fetch(creator + "/api/admin/responses", { headers });
  assert.equal(responses.status, 200);
  assert.ok(Number.isInteger((await responses.json()).total));
  const csv = await fetch(creator + "/api/admin/export.csv", { headers });
  assert.equal(csv.status, 200);
  assert.match(await csv.text(), /response_id,submitted_at_utc,revision/);
  const logout = await write("/api/auth/logout", {}, headers);
  assert.equal(logout.status, 200);
  assert.match(logout.headers.get("Set-Cookie"), /Max-Age=0/);
}
assert.equal(
  (await write("/api/auth/login", { password: "synthetic-wrong-password" }))
    .status,
  401,
);
console.log(
  `Live checks passed: ${passwords.length} approved logins, wrong-password denial, session guards, private reads/export, logout and public isolation. Study data was not changed.`,
);
