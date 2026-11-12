# Staging deployment

Staging is a persistent, isolated environment for mobile, PWA, auth, sync, and
browser validation before production promotion.

## Environment inventory

| Purpose | Production | Staging |
|---|---|---|
| Branch | `main` | `staging` |
| Origin | `https://stafinthelab.com` | `https://staging.stafinthelab.com` |
| Azure resource group | `rg-durability` | `rg-durability-staging` |
| Static Web App | `swa-durability` | `swa-durability-staging` |
| Azure fallback hostname | `calm-dune-0f6b5c61e.5.azurestaticapps.net` | `black-forest-0d267be1e.5.azurestaticapps.net` |
| Storage account | `stdurability40070b` | `stdurabilitystaging` |
| Tables | `sessions`, `history` | separate empty `sessions`, `history` |
| Deployment secret | `AZURE_STATIC_WEB_APPS_API_TOKEN` | `AZURE_STATIC_WEB_APPS_API_TOKEN_STAGING` |

The staging API has its own `STORAGE_CONNECTION_STRING`. Never copy, query,
seed, or restore production entities into staging. The staging client starts
with synthetic browser-local data only; signing in may sync that synthetic data
to the isolated staging tables.

## DNS and custom hostname

`stafinthelab.com` is authoritative on Cloudflare. Create this proxied-off
record in the Cloudflare zone:

```text
Type: CNAME
Name: staging
Target: black-forest-0d267be1e.5.azurestaticapps.net
Proxy status: DNS only
TTL: Auto
```

Then validate the hostname:

```bash
az staticwebapp hostname set \
  --name swa-durability-staging \
  --resource-group rg-durability-staging \
  --hostname staging.stafinthelab.com \
  --validation-method cname-delegation
```

Do not point staging at the production Static Web App. Do not reuse the
production storage connection string.

## Validation and deployment

Pull requests into `staging` or `main` run `.github/workflows/ci.yml`: client
unit tests, lint, build, API tests/build, and Chromium E2E.

Pushing the validated feature commit to `staging` runs
`.github/workflows/azure-swa-staging.yml`, which:

1. Re-runs client, API, and browser validation.
2. Builds with `VITE_DEPLOY_ENV=staging`.
3. Deploys only with the staging deployment token.
4. Runs an external smoke test against `staging.stafinthelab.com`.

The staging build has a red banner, includes environment/build metadata, starts
with synthetic data on an empty origin, blocks execution on unknown hostnames,
uses relative same-origin API requests, and installs an origin-scoped service
worker. The Static Web App CSP restricts `connect-src` to `'self'`.

Local staging smoke:

```bash
npm run test:e2e:staging
```

Deployed smoke through the Azure fallback hostname:

```bash
PLAYWRIGHT_BASE_URL=https://black-forest-0d267be1e.5.azurestaticapps.net \
STAGING_SMOKE=1 \
STAGING_EXPECTED_ORIGIN=https://black-forest-0d267be1e.5.azurestaticapps.net \
npx playwright test e2e/staging-smoke.spec.ts
```

## Promotion

1. Commit the feature on its feature branch.
2. Merge or fast-forward that validated commit into `staging`.
3. Wait for the staging deployment and external smoke test to pass.
4. Test install/update, auth, sync, offline launch, and mobile interactions on
   `staging.stafinthelab.com`.
5. Promote the same commit from `staging` to `main` by pull request.
6. Production deploys only from `main`; its workflow repeats unit, API, build,
   and browser E2E before upload.

No staging workflow has a production deployment token, and the production
workflow has no staging trigger.

## Rollback

For staging, revert the bad commit on `staging`; the staging workflow redeploys
the previous behavior. For production, revert on `main`; never deploy a feature
branch directly to the production resource. The manual GitHub Pages workflow is
an emergency static-client fallback only and does not provide the Azure API.

Before rollback, export any synthetic staging logs you want to keep. Never move
them into the production storage account.
