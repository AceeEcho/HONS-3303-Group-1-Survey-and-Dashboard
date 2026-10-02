# Deployment and maintenance

## Current deployment

Account: Canewman1101@gmail.com's Account. Workers namespace: echowake.workers.dev.

| Resource | Name |
|---|---|
| Respondent Worker | survey-hons3303survey |
| Creator Worker | dashboard-hons3303survey |
| Shared D1 | hons3303survey |
| D1 ID | 429c0ed8-c256-47d2-b6d9-27cb9059867a |

The initial migration is applied. The app starts with an empty unpublished draft and no responses. No EchoShop, aceeechostore.com or WakeDock configuration was changed. No paid service or new API token was created. Existing Wrangler authorization was used.

The account has Workers Free and Zero Trust Free. This app uses the owner's chosen shared-password authentication instead of Cloudflare Access; no Access application was created for it. No email verification code is required.

## Updating code

```sh
npm test
npm run check:deploy
npm run deploy:admin
npm run deploy:public
```

Both Workers use the same D1 binding and Worker-first asset routing. Preview URLs are disabled. Do not deploy wrangler.local.jsonc. Add future schema changes as new migrations, then apply them explicitly to this project's database.

## Creator passwords

The creator Worker has two secrets: SESSION_SECRET and CREATOR_PASSWORD_HASHES. The four owner-supplied addresses are accepted as case-insensitive shared passwords. They are not stored as plaintext in the source or static assets. All creators have equal access to editing, publishing, response reading and exporting.

To intentionally replace the approved passwords, supply a JSON array through stdin to `node scripts/configure-creators.mjs` from a trusted local terminal. Do not write passwords in source files. The helper generates a fresh random signing secret and keyed hashes, then uploads them using Wrangler's secret store. Replacing them invalidates existing sessions. Do not rerun it during ordinary code deployment.

## Runtime bindings

Public: DB, ASSETS, APP_MODE=public, ENVIRONMENT=production, SUBMIT_LIMITER (10 attempts/minute/IP).

Creator: DB, ASSETS, APP_MODE=admin, ENVIRONMENT=production, AUTH_MODE=shared-password, PUBLIC_SURVEY_URL, AUTH_LIMITER (5 login attempts/minute/IP), SESSION_SECRET, CREATOR_PASSWORD_HASHES.

## First study

Enter an approved password at the creator dashboard. Add the actual class questions and any introduction/consent, wait for All changes saved, then publish. Share the respondent link or generated QR. Test fixtures were kept in isolated local databases; there is no artificial production study or participant response.

For a future switch to Cloudflare Access, configure an explicit email allow policy, protect the creator Worker's route, replace the shared-password mode with ACCESS_TEAM_DOMAIN, ACCESS_AUD and ADMIN_EMAILS, and test verified login before using it. Keep the public Worker outside that policy.

Labeled scales and autosave use the existing JSON draft/revision schema. No new migration or resources are needed. Existing published definitions and responses are preserved.
