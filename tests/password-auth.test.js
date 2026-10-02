import test from "node:test";
import assert from "node:assert/strict";
import { SignJWT } from "jose";
import {
  authorize,
  createPasswordSession,
  passwordFingerprint,
  clearPasswordSession,
} from "../src/auth.js";
import worker from "../src/worker.js";

// These synthetic credentials never touch the deployed database or secret store.
const origin = "https://studio.example.test";
const secret = "synthetic-test-secret-with-at-least-32-characters";
const password = "creator@example.test";
const fingerprint = await passwordFingerprint(password, secret);
const env = {
  APP_MODE: "admin",
  ENVIRONMENT: "production",
  AUTH_MODE: "shared-password",
  SESSION_SECRET: secret,
  CREATOR_PASSWORD_HASHES: fingerprint,
  AUTH_LIMITER: { limit: async () => ({ success: true }) },
};
const sessionRequest = (cookie) =>
  new Request(origin + "/api/admin/survey", {
    headers: cookie ? { Cookie: cookie.split(";")[0] } : {},
  });
const loginRequest = (payload, extra = {}, path = "/api/auth/login") =>
  new Request(origin + path, {
    method: "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      "X-Survey-Request": "1",
      ...extra,
    },
    body: JSON.stringify(payload),
  });

test("approved shared password creates a secure eight-hour session without revealing identity", async () => {
  const cookie = await createPasswordSession(
    sessionRequest(),
    env,
    "  CREATOR@example.test  ",
  );
  assert.match(cookie, /^__Host-fieldwork_creator=/);
  for (const flag of [
    "Secure",
    "HttpOnly",
    "SameSite=Strict",
    "Path=/",
    "Max-Age=28800",
  ]) {
    assert.ok(cookie.includes(flag));
  }
  assert.ok(!cookie.includes(password));
  assert.deepEqual(await authorize(sessionRequest(cookie), env), {
    email: "Creator",
    local: false,
    authentication: "shared-password",
  });
  for (const value of [
    undefined,
    null,
    "",
    42,
    "unknown@example.test",
    "x".repeat(255),
  ]) {
    await assert.rejects(
      () => createPasswordSession(sessionRequest(), env, value),
      { status: 401 },
    );
  }
});

test("creator API rejects missing, forged, expired, wrong-host and revoked sessions", async () => {
  await assert.rejects(() => authorize(sessionRequest(), env), { status: 401 });
  await assert.rejects(
    () => authorize(sessionRequest("__Host-fieldwork_creator=forged"), env),
    { status: 401 },
  );
  const cookie = await createPasswordSession(sessionRequest(), env, password);
  await assert.rejects(
    () =>
      authorize(
        new Request("https://other.example.test/api/admin/survey", {
          headers: { Cookie: cookie.split(";")[0] },
        }),
        env,
      ),
    { status: 401 },
  );
  await assert.rejects(
    async () =>
      authorize(sessionRequest(cookie), {
        ...env,
        CREATOR_PASSWORD_HASHES: await passwordFingerprint(
          "replacement@example.test",
          secret,
        ),
      }),
    { status: 403 },
  );
  const expired = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setSubject(fingerprint)
    .setIssuer(origin)
    .setAudience("fieldwork-creators")
    .setExpirationTime(1)
    .sign(new TextEncoder().encode(secret));
  await assert.rejects(
    () => authorize(sessionRequest("__Host-fieldwork_creator=" + expired), env),
    { status: 401 },
  );
  for (const missing of [
    { SESSION_SECRET: undefined },
    { CREATOR_PASSWORD_HASHES: "" },
  ]) {
    await assert.rejects(
      () => authorize(sessionRequest(cookie), { ...env, ...missing }),
      { status: 503 },
    );
  }
});

test("login routes enforce origin, request headers, throttling and public-host isolation", async () => {
  let response = await worker.fetch(loginRequest({ password }), env);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "{}");
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.ok(response.headers.get("Set-Cookie"));
  const sessionUrl = origin + "/api/auth/session";
  assert.deepEqual(
    await (await worker.fetch(new Request(sessionUrl), env)).json(),
    { authenticated: false },
  );
  assert.deepEqual(
    await (
      await worker.fetch(
        new Request(sessionUrl, {
          headers: {
            Cookie: response.headers.get("Set-Cookie").split(";")[0],
          },
        }),
        env,
      )
    ).json(),
    { authenticated: true },
  );
  for (const [extra, status] of [
    [{ Origin: "https://other.example.test" }, 403],
    [{ "X-Survey-Request": "" }, 403],
    [{ "Content-Type": "text/plain" }, 415],
  ])
    assert.equal(
      (await worker.fetch(loginRequest({ password }, extra), env)).status,
      status,
    );
  for (const payload of [{ password: "wrong" }, null, {}]) {
    assert.equal((await worker.fetch(loginRequest(payload), env)).status, 401);
  }
  assert.equal(
    (
      await worker.fetch(loginRequest({ password }), {
        ...env,
        AUTH_LIMITER: { limit: async () => ({ success: false }) },
      })
    ).status,
    429,
  );
  assert.equal(
    (
      await worker.fetch(loginRequest({ password }), {
        ...env,
        AUTH_LIMITER: undefined,
      })
    ).status,
    503,
  );
  assert.equal(
    (
      await worker.fetch(loginRequest({ password }), {
        ...env,
        APP_MODE: "public",
      })
    ).status,
    404,
  );
  response = await worker.fetch(loginRequest({}, {}, "/api/auth/logout"), env);
  assert.equal(response.headers.get("Set-Cookie"), clearPasswordSession());
  assert.match(clearPasswordSession(), /Max-Age=0/);
  for (const path of [
    "/api/admin/survey",
    "/api/admin/responses",
    "/api/admin/export.csv",
  ]) {
    assert.equal(
      (await worker.fetch(new Request(origin + path), env)).status,
      401,
    );
  }
});
