# Fieldwork Survey Studio

A standalone class survey app with a public respondent site, a private creator dashboard and one shared Cloudflare D1 database. It is separate from EchoShop and WakeDock.

## Live app

- Public survey: https://survey-hons3303survey.echowake.workers.dev
- Creator dashboard: https://dashboard-hons3303survey.echowake.workers.dev/admin
- Database: hons3303survey

The study starts blank and unpublished. Open the dashboard, enter one of the four creator passwords supplied by the owner, add questions, save and publish. Respondents need no account. Dashboard sign-in uses an email address as a shared password, as explicitly selected by the owner. It does not verify inbox ownership or use Cloudflare Access.

## Features

- Short text, multiple choice, checkboxes and ratings; optional or required answers
- Editable title, introduction and consent; explicit saving and publishing
- Immutable published revisions; responses preserve the exact question wording and choices
- Response browsing, pagination and complete CSV export with spreadsheet formula protection
- Public link, QR code, pause/resume collection, responsive layout and reduced motion
- Concurrent draft edits cannot silently overwrite each other

## Local development

Requires Node.js 22.12+ and npm (tested with Node 24).

```sh
npm ci
npm run db:local
npm run dev
```

Open http://127.0.0.1:8787/admin and choose **Open local studio**. The preview sign-in works only with development mode on a loopback hostname. Local D1 data persists separately from production. Never expose this development server to the Internet.

```sh
npm test
npm run test:browser
npm run check:deploy
```

Browser tests automatically create a separate local database for each run and use synthetic fixtures. Set CHROMIUM_PATH to an installed Chromium executable when needed. They never use the deployed database. The dependency lockfile pins package versions.

See docs/DEPLOYMENT.md, docs/SECURITY.md and docs/VALIDATION.md for maintenance and verification details.
