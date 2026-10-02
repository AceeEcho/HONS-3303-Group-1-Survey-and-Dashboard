# Authentication and research-data boundaries

## Current sign-in

The owner explicitly chose an email address alone as a shared password. This is a knowledge check, not verified identity: anyone who knows one of the allowed addresses can edit the entire study and read/export all responses. Cloudflare Access is not protecting this dashboard.

Passwords are normalized (trimmed and lowercased), checked against keyed SHA-256 hashes in Worker secrets, and never sent back to the browser. A successful sign-in issues an eight-hour HS256 session bound to the creator host. Its cookie is Secure, HttpOnly, SameSite=Strict and host-only. Every creator API validates the signature, issuer, audience, required claims, expiration and continued allowlist membership. Forged, missing, expired and revoked sessions fail. Sign-out clears the browser cookie; copied bearer sessions remain valid until expiry or secret rotation. This is not an identity audit trail.

Login is limited to five attempts per minute per IP. The generic login page and static assets contain no draft or response data. Missing secrets fail closed for login and creator APIs. The existing RS256 Cloudflare Access validation remains available as an alternative mode but is not used in this deployment. Local preview authentication is restricted to development mode on a loopback hostname.

## Data boundaries

The public Worker accepts anonymous submissions and serves only the active published definition. It has no creator, response-reading or export routes. The creator Worker does not accept respondent submissions. Both share the D1 database through separate guarded routes.

Writes require a matching Origin, a custom request header and JSON. Responses use no-store caching. CSP, anti-framing, no-referrer and MIME-sniffing headers are applied. User content is escaped and SQL is parameterized. Form payloads, credentials and sessions are not logged by the app; Worker observability is disabled in the configs.

D1 stores drafts, immutable published revisions and responses. Each response refers to its exact published version. Required answers, choices, types, bounds and consent are checked on the server. Retries with an identical submission UUID are idempotent; conflicting reuse fails. Concurrent draft saves are checked by version. Pausing collection rejects new submissions. CSV cells are quoted and common spreadsheet formulas are neutralized.

## Limits

Anonymous respondents need no account. The app does not store IP addresses or user agents in response records, although the hosting provider may process technical request data. There is no one-person-one-response guarantee. Rate limits provide basic abuse control.

Limits are 80 questions, 30 options per choice question, 4,000 characters per text answer and 512 KiB per request. All creator passwords have equal permissions. There is no response deletion endpoint, automatic retention policy, fine-grained role separation, multi-study tenancy or claimed compliance approval.

Maintain dependencies, review creator access, decide backup/retention requirements and keep exported research data in appropriate storage. Add migrations rather than altering applied ones. Changing passwords with the configuration helper rotates the signing secret and invalidates all existing sessions.
