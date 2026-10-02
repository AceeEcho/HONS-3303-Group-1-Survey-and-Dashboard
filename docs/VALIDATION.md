# Validation report

Date: 2026-10-02. This report separates verified behavior from remaining checks.

## Passed in the cloud workspace

- Production frontend build with Vite
- Cloudflare Wrangler dry-run packaging passes for both public and creator Workers, including D1, static assets and rate-limiter bindings (no upload/deployment performed)
- 10 automated test cases, including a full D1 integration lifecycle on the Cloudflare workerd/Miniflare local runtime
- Empty drafts allowed; empty or invalid studies cannot publish
- All four question formats; required fields, allowed choices, rating bounds, consent, unexpected question IDs, duplicate IDs/choices
- Explicit save and optimistic concurrency reject stale drafts
- Publishing saves immutable versions; database UPDATE/DELETE attempts on published revisions are rejected
- Responses are saved in D1, not browser localStorage; snapshots retain original wording after a later edited/reordered publication
- Duplicate retry of the same response UUID is idempotent; conflicting reuse is rejected
- In-flight old-version submission remains tied to that version; paused collection rejects new submissions
- Private export contains original versioned question text and protects against common CSV formula injection
- Same-origin write guard rejects another Origin
- Correctly signed/authorized JWT succeeds; forged signatures, wrong audience, expired tokens and unapproved emails fail
- Local sign-in is not accepted on a non-loopback hostname or in production mode
- Public-host admin UI, management, response-read and export paths return 404
- Unconfigured creator deployment fails closed; no creator HTML/data served
- Content security and anti-framing headers applied
- `npm audit --omit=dev` reported zero known production dependency vulnerabilities at the time of testing

## Pending browser QA

The packaged Playwright end-to-end test suite was attempted, but this cloud executor blocks Chromium's required process socket (`socket() failed: Operation not permitted`) before a page can load. The cloud browser also rejected the loopback preview URL (`ERR_BLOCKED_BY_CLIENT`). No layout screenshot, mobile rendering, real browser flow or reduced-motion render is claimed as verified here.

`tests/browser.spec.js` is ready to run on a permitted local environment. It checks desktop and 390px mobile layout, no horizontal overflow, add/edit/required/save/reload/publish, local QR rendering, required-answer validation, response submission, private response inspection and reduced motion. It writes desktop/mobile screenshots to docs/ when it runs. Synthetic fixtures are clearly labeled and must use an empty local test database, never real research data.

For a Mac, set CHROMIUM_PATH to a verified installed Chrome executable, such as the executable inside its application bundle, before running `npm run test:browser`. Do not assume its path without checking. Alternatively install Playwright's supported Chromium and update the launch configuration to use it.

## Pending production checks

No live resources were created or deployed. Cloudflare account access could not be verified due to the provider's verification screen; existing account or sign-in state is unknown. Real Access sign-in, free-plan capacity, end-to-end production persistence, approved-account access, unapproved-account denial and the public hosted QR destination must be checked once the actual account and resources are available.

Passing local tests is not a formal security audit or research/compliance approval.
