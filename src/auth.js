import { createRemoteJWKSet, jwtVerify, SignJWT } from "jose";
import { HttpError } from "./model.js";

const keysets = new Map();
const encoder = new TextEncoder();
const sessionCookie = "__Host-fieldwork_creator";
const sessionSeconds = 8 * 60 * 60;

export function isLocal(request, env) {
  return (
    env.APP_MODE === "local" &&
    env.ENVIRONMENT === "development" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(new URL(request.url).hostname)
  );
}

export function usesSharedPassword(env) {
  return (
    env.APP_MODE === "admin" &&
    env.ENVIRONMENT === "production" &&
    env.AUTH_MODE === "shared-password"
  );
}

function cookieValue(request, name) {
  return request.headers
    .get("Cookie")
    ?.split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(name + "="))
    ?.slice(name.length + 1);
}

function passwordSettings(env) {
  const hashes = String(env.CREATOR_PASSWORD_HASHES || "")
    .split(",")
    .filter(Boolean);
  if (
    typeof env.SESSION_SECRET !== "string" ||
    env.SESSION_SECRET.length < 32 ||
    !hashes.length ||
    hashes.some((hash) => !/^[A-Za-z0-9_-]{43}$/.test(hash))
  ) {
    throw new HttpError(503, "Creator sign-in has not been configured.");
  }
  return { key: encoder.encode(env.SESSION_SECRET), hashes };
}

// Keyed hashes keep the shared passwords out of source, configuration and cookies.
export async function passwordFingerprint(password, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(password.trim().toLowerCase()),
    ),
  );
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function matchesAllowed(fingerprint, hashes) {
  if (typeof fingerprint !== "string") return false;
  // Compare each fixed-length value without revealing which entry matched.
  let allowed = 0;
  for (const hash of hashes) {
    let difference = fingerprint.length ^ hash.length;
    for (let i = 0; i < hash.length; i++) {
      difference |= hash.charCodeAt(i) ^ (fingerprint.charCodeAt(i) || 0);
    }
    allowed |= Number(difference === 0);
  }
  return allowed !== 0;
}

export async function createPasswordSession(request, env, password) {
  const { key, hashes } = passwordSettings(env);
  if (
    typeof password !== "string" ||
    !password.trim() ||
    password.length > 254
  ) {
    throw new HttpError(401, "That password is not allowed. Please try again.");
  }
  const fingerprint = await passwordFingerprint(password, env.SESSION_SECRET);
  if (!matchesAllowed(fingerprint, hashes)) {
    throw new HttpError(401, "That password is not allowed. Please try again.");
  }
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setSubject(fingerprint)
    .setIssuer(new URL(request.url).origin)
    .setAudience("fieldwork-creators")
    .setExpirationTime(Math.floor(Date.now() / 1000) + sessionSeconds)
    .sign(key);
  return `${sessionCookie}=${token}; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=${sessionSeconds}`;
}

export function clearPasswordSession() {
  return `${sessionCookie}=; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`;
}

export async function authorize(request, env, keyResolver) {
  if (
    isLocal(request, env) &&
    cookieValue(request, "fieldwork_local") === "creator"
  ) {
    return { email: "local preview", local: true };
  }

  if (usesSharedPassword(env)) {
    const { key, hashes } = passwordSettings(env);
    const token = cookieValue(request, sessionCookie);
    if (!token)
      throw new HttpError(401, "Enter a creator password to continue.");
    let payload;
    try {
      ({ payload } = await jwtVerify(token, key, {
        issuer: new URL(request.url).origin,
        audience: "fieldwork-creators",
        algorithms: ["HS256"],
        requiredClaims: ["exp", "iat", "sub"],
      }));
    } catch {
      throw new HttpError(401, "Your session ended. Please sign in again.");
    }
    if (!matchesAllowed(payload.sub, hashes)) {
      throw new HttpError(403, "This password no longer has creator access.");
    }
    // A shared password does not establish who is holding it.
    return {
      email: "Creator",
      local: false,
      authentication: "shared-password",
    };
  }

  // Keep the verified Cloudflare Access path available for a future mode change.
  if (
    !/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.ACCESS_TEAM_DOMAIN || "") ||
    !env.ACCESS_AUD ||
    /REPLACE/.test(env.ACCESS_AUD) ||
    !env.ADMIN_EMAILS?.trim()
  ) {
    throw new HttpError(503, "Creator sign-in has not been configured.");
  }
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token)
    throw new HttpError(401, "Sign in to the private creator studio.");
  const issuer = `https://${env.ACCESS_TEAM_DOMAIN}`;
  let keys = keyResolver;
  if (!keys) {
    if (!keysets.has(issuer)) {
      keysets.set(
        issuer,
        createRemoteJWKSet(new URL(issuer + "/cdn-cgi/access/certs")),
      );
    }
    keys = keysets.get(issuer);
  }
  let payload;
  try {
    ({ payload } = await jwtVerify(token, keys, {
      issuer,
      audience: env.ACCESS_AUD,
      algorithms: ["RS256"],
      requiredClaims: ["exp", "iat", "sub", "email"],
    }));
  } catch {
    throw new HttpError(
      401,
      "Your sign-in could not be verified. Sign in again.",
    );
  }
  const allowed = env.ADMIN_EMAILS.split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (
    typeof payload.email !== "string" ||
    !allowed.includes(payload.email.toLowerCase())
  ) {
    throw new HttpError(403, "This account does not have creator access.");
  }
  return { email: payload.email, local: false };
}
