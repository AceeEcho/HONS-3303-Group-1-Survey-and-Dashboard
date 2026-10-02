# Validation report

Verified locally and on Cloudflare on 2026-10-02.

## Automated checks

- 18 unit/integration tests passed, including the full local D1 save/publish/submit/export lifecycle.
- Shared-password sessions: approved and invalid passwords, secure cookie flags, missing/forged/expired/wrong-host/revoked sessions, missing configuration, same-origin enforcement, throttling, sign-out and session-status endpoint.
- Existing Access JWT validation remains tested as an alternative mode.
- Immutable revisions, required answers/consent, choice/rating validation, optimistic draft concurrency, idempotent retries, pause/resume and CSV formula escaping.
- Local preview authentication cannot be used on a production or non-loopback host.
- Production configuration checks and frontend build passed; both Workers deployed successfully.
- Production dependency audit reported zero known vulnerabilities.

## Browser checks

The desktop/mobile browser test passed using an isolated local D1 database. It created a labeled QA survey, saved/reloaded/published it, rendered a QR, rejected an empty required answer, submitted a synthetic response, inspected it and checked reduced motion. No fixtures were written to production.

The local Chrome browser was used to sign into the live creator app, open builder/responses/sharing, and sign out. The live builder and sign-in screen were inspected at 390px width, with no horizontal overflow. Desktop and mobile sign-in/public-page visual lint reports have zero findings after contrast corrections. The local creator-page visual lint reports also have zero findings. Visual lint is a useful layout check, not a complete accessibility audit.

## Live checks

- All four owner-supplied shared passwords accepted; an incorrect password rejected.
- Missing or forged sessions rejected for draft, response-read and CSV export endpoints.
- Authenticated reads/export and logout worked; cross-origin login rejected.
- Public root and survey endpoint are accessible without an account.
- Public creator UI, draft, response-read and export endpoints return 404.
- Production remains an empty unpublished draft: zero questions, zero published revisions, zero responses.
- Creator uses the selected shared-password gate, not Cloudflare Access or verified email identity.
- Workers/D1 are on the existing account; preview deployments disabled. No paid service, API token, domain or existing EchoShop/WakeDock resource was changed.

Current deployment versions:

- Creator: bd259b28-6fab-40f0-90b4-7c1cc0286528
- Public: ffbf51be-53b8-422d-9514-9e3bb0c1415f

## Still needed by the study creators

Add the actual study questions and introduction/consent, save and publish, then share the public link or QR. Production save/publish/submission was not exercised with artificial content so the real database remains clean; those flows passed on the local D1 runtime. Establish any study-specific data handling requirements before inviting respondents. These checks do not constitute research approval or a formal security audit.

## Issue #1 quality-of-life update

- Labeled scales support 0 or 1 as the first value and a distinct label for every point. Server validation rejects invalid ranges/labels/answers; CSV preserves each response's original published scale label.
- Draft text whitespace is preserved while editing; only published snapshots are normalized.
- Autosave after a 650 ms pause and visible-window synchronization every five seconds.
- Three-way merge tests cover disjoint fields, question edits, insertions, deletion/edit conflicts, question-type changes and ordering conflicts.
- Database save acknowledgement uses UPDATE RETURNING so a newer edit cannot be mistaken for the snapshot written by an earlier request.
- Four browser scenarios passed: desktop/mobile authoring and submission; labeled-scale reload/zero submission/immutable response labels; concurrent creators with automatic disjoint merges and explicit conflict resolution; and newer typing during a delayed save with focus retained.
- HONS 3303 branding, official Texas Tech Double T, restrained scarlet/charcoal palette and functional creator headings. Local creator visual lint passed with zero findings on desktop and mobile.

All collaboration and scale-write tests use isolated local D1 data. Deployment updates do not alter the existing cloud study, published versions or responses. Post-deployment checks verified all four creator passwords, private reads/export, forged-session denial, public-route isolation and the updated live desktop/mobile creator layout. Live sign-in/public-page visual lint reports passed with zero findings.
