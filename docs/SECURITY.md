# Security and research-data boundaries

## Implemented boundaries

The public Worker accepts anonymous submissions and serves only the active published definition. It has no management, response-reading or export routes. The private Worker does not accept respondent submissions. Creator HTML and every private API call verify a Cloudflare Access RS256 JWT's signature, issuer, audience, expiration, issued-at, subject and email. The email must also be on the explicit server-side allowlist. Missing production configuration fails closed. Headers that merely claim an email are not trusted.

All writes require a same-origin Origin header, a custom request header and JSON content type. No CORS allowlist is emitted. API responses are no-store, and HTML uses a restrictive CSP, anti-framing, no-referrer and MIME-sniffing protection. Frontend inserts escape user-controlled content. Database statements are parameterized.

D1 owns saved drafts, published revisions and responses. Browser storage is not used as authoritative storage. Immutable revision triggers prevent updating or deleting a published snapshot. Each submission is validated against its revision's question IDs, required flags, types, bounds and allowed choices. An in-flight participant may submit an older published revision while collection remains open. Pausing closes submission acceptance, including an atomic check on insertion. Reusing a submission UUID with identical content is idempotent; different content is rejected.

Draft saves and publication require the latest draft version. Publishing uses a D1 transactional batch with a conditional revision insert, so a stale editor cannot overwrite a newer publication.

The CSV is a complete long-form export with response IDs, timestamps, immutable version numbers and original question labels/types. Potential spreadsheet formulas are prefixed with an apostrophe and cells are properly quoted.

## Deliberate limits

- Anonymous means no required respondent account or app-collected respondent identity. The app does not save participant IP or user-agent in response records. Cloudflare may process technical request metadata. This is not a promise of cryptographic anonymity, regulatory compliance or institution-approved consent
- There is no one-person-one-response guarantee. UUID idempotency prevents duplicate retries of one submission only; it does not identify people. Participants can submit again in a new session
- Limit: 80 questions, 30 options per choice question, 4,000 characters per text answer, 512 KiB request body. Rating scales run from 1 to a maximum of 3–10
- Basic per-IP rate limiting does not prevent distributed spam. No CAPTCHA, Turnstile secret, extra credential or third-party analytics was provisioned
- All allowed creators currently have equivalent access. Do not add people unless they are allowed to see all stored research data
- No respondent file upload, email collection, third-party font/analytics request, identity tracking or automated research inference
- No response deletion, permanent erasure, configurable retention job, data-subject request portal, audit log or multi-study tenant isolation is claimed. Confirm your institution's requirements before collecting sensitive or regulated research data
- Do not change the security settings or deploy without verifying actual private-host Access and public-host routing in the real account. Local JWT tests do not replace end-to-end cloud identity testing

## Future maintenance

Keep Node/npm dependencies updated, review access when researchers leave, set operational/budget limits, and decide a backup and retention plan before live collection. Append database migrations rather than editing already-applied ones. Avoid logging form payloads or credentials. Exported CSV files contain potentially sensitive free-text research responses; keep them in approved storage.
