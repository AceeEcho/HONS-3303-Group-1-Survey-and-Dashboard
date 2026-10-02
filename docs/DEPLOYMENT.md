# Activate on Cloudflare Workers + D1

## Exact blocker

Cloudflare account state could not be verified: a security-verification screen blocked the read-only account check. This is not evidence that the account is absent or signed out. No verified deployment resource IDs or approved creator identity are configured. Production setup requires the account owner's Cloudflare login, chosen creator email(s), a D1 database, and a Cloudflare Access application. Credential generation, new persistent access and policy changes must be performed by the owner or explicitly approved through an appropriate secure setup flow. Do not send tokens or passwords through chat.

This project uses **two Workers and one shared D1 database**. That permits a free `workers.dev` URL without purchasing a domain, while Cloudflare Access can protect the entire creator Worker without putting the respondent survey behind a login.

Do not enable full-domain Access on the public survey Worker. Do not deploy `wrangler.local.jsonc`.

## Owner-led setup

1. Review current Cloudflare free-plan terms and limits. Free tiers are usage-limited, not a guarantee of unlimited free operation. Keep the account on its intended plan; do not accept a paid upgrade implicitly.
2. In a trusted local terminal, authorize Wrangler with your Cloudflare account using `npx wrangler login`. This creates persistent CLI access; only do so intentionally. Alternatively use Cloudflare's dashboard with the approved source/upload flow. No authorization has been created by this build.
3. Create one D1 database for this project: `npx wrangler d1 create fieldwork`. Record its returned UUID in `d1_databases[0].database_id` in both production config files. Adjust database names consistently if the account already uses this name.
4. Choose available public and studio Worker names in `wrangler.public.jsonc` and `wrangler.admin.jsonc`. The names in the source are suggestions, not reserved names or verified live URLs.
5. Apply the schema: `npx wrangler d1 migrations apply DB --remote --config wrangler.public.jsonc`. This migration creates only this application's tables and an empty draft.
6. Deploy the private Worker initially with `npm run build && npx wrangler deploy --config wrangler.admin.jsonc` to obtain its actual `workers.dev` hostname. With placeholders, all creator pages and endpoints fail closed with 503. The public survey API is disabled on that Worker. This one initial direct command is needed before Access has an audience; the normal deploy scripts intentionally reject incomplete config.
7. In Workers & Pages, enable Cloudflare Access for the studio Worker's `workers.dev` route. Configure an explicit allow policy with only the creator's approved email address(es). Do not select Everyone. Use the account's supported sign-in method; email one-time PIN is an option when enabled. Review any terms and permissions. Protect preview deployments too, or keep them disabled. The application itself still verifies JWTs on every management/data request.
8. Copy the verified Access team domain and application audience into `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` in `wrangler.admin.jsonc`. Set `ADMIN_EMAILS` to the same explicit comma-separated email allowlist. The public Worker has none of these identity settings.
9. Deploy the public Worker using `npm run build && npx wrangler deploy --config wrangler.public.jsonc`. It starts unpublished, with no questions. Copy the actual returned HTTPS survey URL into `PUBLIC_SURVEY_URL` in the admin config. Do not guess the account subdomain.
10. Run `npm run check:deploy`, then `npm run deploy:admin`. For future updates use `npm run deploy:public` and `npm run deploy:admin`.
11. Open the studio URL and verify permitted sign-in. Confirm an unapproved account is rejected. In a private/unsigned browser, confirm the public URL is reachable and `/admin`, `/api/admin/survey`, `/api/admin/responses` and `/api/admin/export.csv` on the public host return 404. Check these same routes on the creator host require Access and fail without valid identity.
12. Add approved study content, consent/contact/privacy details and any required institutional review information. Publish only when the content is ready. Submit a test response, inspect its version and export it. Decide how to handle your test data before inviting participants. No response deletion endpoint is supplied; any retention/deletion plan requires an intentional database-maintenance workflow.

## Adding a research group later

Require exact, approved addresses. Add each to both the Cloudflare Access allow policy and ADMIN_EMAILS. Merely knowing the private URL does not grant access. All approved creators currently have the same permissions: draft editing, publishing, pausing, viewing and exporting all responses. There are no fine-grained editor/viewer roles, actual invitations, group memberships or unknown identities provisioned in this deliverable. Future role separation needs a new scoped implementation.

## Runtime bindings

- Public Worker: DB, ASSETS, APP_MODE=public, ENVIRONMENT=production, SUBMIT_LIMITER
- Creator Worker: DB, ASSETS, APP_MODE=admin, ENVIRONMENT=production, ACCESS_TEAM_DOMAIN, ACCESS_AUD, ADMIN_EMAILS, PUBLIC_SURVEY_URL
- Both configs set `assets.run_worker_first=true` so route guards execute before static handling
- The public submit limiter is 10 attempts per minute per IP at the Cloudflare binding. It is a basic abuse limit, not identity or a one-person-one-response guarantee. Shared networks may hit it; tune deliberately for the study

## Official references checked

- [Cloudflare Access for Workers](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)
- [Validate Access JWTs](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)
- [Worker-first static asset routing](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/)
- [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)
- [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)
