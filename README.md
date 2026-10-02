# Fieldwork Survey Studio

A standalone survey app for social-sciences research, separate from EchoShop. Public respondents need no account. The creator workspace, responses and exports belong on a separate, authenticated Cloudflare Worker. Both Workers share one D1 database.

## Delivery status

The app and Cloudflare deployment configuration are built. **It is not deployed.** Cloudflare account access could not be verified because its security-verification screen blocked the account check. No verified D1 ID, Access application audience or creator identities are configured. The account may already exist and may already be signed in. No credentials, OAuth grants, paid resources, accounts, domains or invitations were created. There is no live respondent URL yet.

The initial database is an empty, unpublished study. There are no invented study questions or participant records in the source archive. Tests create clearly labeled synthetic fixtures only in local test databases, which are excluded from the archive.

## What works

- Add, edit, remove and reorder questions; required or optional; short text, multiple choice, checkboxes, ratings from 1–3 through 1–10
- Editable title, introduction and optional consent statement
- Explicit save draft and publish; optimistic concurrency prevents overwriting another editor's draft
- Published revisions are immutable SQLite records, protected by database triggers
- Responses reference the exact published snapshot, preserving question wording, choices and ordering
- Public form with inline validation, completion progress, consent when configured, retryable submission and confirmation
- Full private response sets, 50-per-page navigation, and complete long-form CSV export with one row per question and spreadsheet formula protection
- Public link, local QR generation and QR download after publication
- Pause/resume response collection
- Future group access via an explicit creator email allowlist plus Cloudflare Access policy; no group invited or configured
- Responsive layouts, keyboard-visible focus, semantic controls, live status, error focus and reduced-motion support

## Run locally

Requires Node.js 22.12+ (tested with Node 24) and npm.

```sh
npm ci
npm run db:local
npm run dev
```

Open http://127.0.0.1:8787/admin and choose **Open local studio**. The local sign-in exists only when all three conditions hold: APP_MODE is `local`, ENVIRONMENT is `development`, and request hostname is loopback. Production configs cannot use it. Never expose the local development server to the Internet.

Drafts and responses persist in Wrangler's local D1 directory across server restarts. They are not browser-only storage. The public preview is http://127.0.0.1:8787. A QR for this local address works only on the computer serving it; it is not a phone-shareable hosted link.

This execution environment has a read-only home directory. If using it again, prefix commands with `WRANGLER_SEND_METRICS=false XDG_CONFIG_HOME=/tmp/fieldwork-config` and use `npm ci --cache /tmp/fieldwork-npm-cache`. Ordinary computers do not need these environment-specific options.

## Test

```sh
npm test
npm run test:browser
```

Unit/integration tests use an isolated in-memory Miniflare D1 database. Browser tests use the local preview database, require an initially empty database, and intentionally leave labeled QA fixtures there. They exercise mobile and desktop layouts, create/save/reload/publish, submit, inspect a response, and reduced motion. Do not run the browser suite against real research data. Set CHROMIUM_PATH if Chromium is not at `/usr/bin/chromium`.

The lockfile pins the resolved dependency versions. The test harness uses Miniflare's provided v4-to-v5 compatibility conversion because the current Wrangler dependency supplies the v5 alpha runtime. Production output is standard Workers-compatible ESM, with `fetch(request, env)` exported by default.

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md), [docs/SECURITY.md](docs/SECURITY.md) and [docs/VALIDATION.md](docs/VALIDATION.md).
