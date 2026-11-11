# Continuous integration (ZT-13)

The workflow is [`.github/workflows/ci.yml`](../.github/workflows/ci.yml). It
runs on pull requests, on pushes to `main` and `feature/**`, and on demand. It
**verifies; it never deploys.** Render and Vercel deploy on their own triggers
(`render.yaml` deploys `main`), and nothing in CI starts them.

| Job | Checks |
|---|---|
| `frontend` | `npm ci` from the lockfile; lint; unit tests; the production build (prerender included); a second build with the placeholder origin `https://ci.example`, then `npm run check:seo` on what crawlers receive |
| `backend` | `npm ci`; a **disposable** `postgres:16-alpine` service; the full suite through the guarded runner (unit and PostgreSQL integration tests on a freshly rebuilt `zurii_test`); `db:test:verify` (schema = baseline + documented migrations, catalogue = artifact); `catalogue:check` and `catalogue:localize:check` |
| `images` | `npm ci`; `npm run verify` (every published image and the manifest) |

Node is set from [`.nvmrc`](../.nvmrc) (24) for every job.

## Safety

- **Permissions:** `contents: read` only. Checkouts do not keep the token
  (`persist-credentials: false`). Actions are pinned to full commit SHAs, with
  the version in a comment.
- **The only database CI reaches** is the job's own service container, created
  and destroyed with the job. It is set up with the same role (no superuser),
  owner and `zurii.environment = 'test'` marker as `infra/local-db`. The test
  runner refuses any other database.
- **No stored secrets.** The database password and both JWT secrets are random
  per run and masked in the log. No production credential exists in CI.
- **No deployment** step, token or webhook.

## Verified so far

The same steps were rehearsed locally on a clean copy of the working tree
(no `node_modules`, builds, `.git` or `.env` files), with `npm ci` from each
lockfile and a disposable `postgres:16-alpine` set up by the workflow's SQL.
Every step passed. That is evidence the workflow is correct, **not** a CI
result: **CI is unverified until it has run on GitHub Actions.**

Phase 7 (2026-11-11) repeated the rehearsal on a fresh copy of the final tree
and confirmed that both pinned action SHAs are exactly the commits their tags
name (`actions/checkout` v7.0.1, `actions/setup-node` v7.1.0, via
`git ls-remote`). CI does not build the Docker images; a frontend image that
could not build at all went unnoticed until Phase 7 (fixed). Adding a
`docker build` job for both images is a recommended follow-up.

## Recommended branch protection

These are recommendations only. Settings were not changed. For `main`:

- Require a pull request before merging, with at least one approving review.
  Dismiss stale approvals when new commits arrive.
- Require these status checks to pass, and the branch to be up to date:
  - `Frontend — lint, unit tests, production build, SEO output`
  - `Backend — unit and PostgreSQL integration tests, migrations, catalogue`
  - `Image manifest integrity`
- Require conversation resolution.
- Block force pushes and deletion.
- Apply the rules to administrators too.
- Merging `main` deploys the backend automatically (`render.yaml`
  `autoDeploy: true`). Consider turning that off and deploying deliberately
  once CI is green. Production migrations (0004, 0005) must be applied
  **before** a merge that needs them ([DATABASE_MIGRATIONS.md](DATABASE_MIGRATIONS.md)).
- Enable Dependabot (or Renovate) for npm and GitHub Actions. Upgrades then
  arrive as pull requests that CI tests, instead of being applied blindly.
