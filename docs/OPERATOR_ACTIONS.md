# Outstanding operator actions

Everything below is **open** until someone with access to the production
accounts has done it and recorded who checked it and when. None of it can be
done, or confirmed, from a development machine, and none of it was. Creating a
new branch does not resolve any of it.

## Status register (Phase 7, 2026-11-11)

**VERIFIED** needs evidence, the responsible operator and the date — none has
been provided, so nothing below is VERIFIED. **BLOCKED** names what it waits on.
Local rehearsals are recorded as preparation, not as verification. The release
sequence is in [RELEASE_RUNBOOK.md](RELEASE_RUNBOOK.md).

| # | Item | Status | Responsible | Verified on | Evidence so far / unblocks when |
|---|---|---|---|---|---|
| 1 | Exposed credential rotation (ZT-01) | OPEN | Owner | — | No owner evidence. The exposed values are still reachable in this **public** repository's history (locations: the audit report, deliberately not repeated here). Rotate first; a history rewrite is optional and comes after. |
| 2 | Legacy admin account revocation | OPEN | Owner | — | `node create-admin.js list` / `disable` on production, run by the owner. |
| 3 | Production backup and verified restore | OPEN | Owner | — | Procedure rehearsed locally on a reconstructed legacy database (runbook §2). |
| 4 | Migrations 0001–0005 adoption | BLOCKED | Owner | — | Waits on 1–3 and approval. Rehearsed locally end to end, including refusal on drift; restored copies now verify (Phase 7 fix). |
| 5 | `contacts.status` default drift decision | OPEN | Owner | — | Needed during adoption if production defaults to `'new'` (runbook §3). |
| 6 | Vercel → Render client-IP check | BLOCKED | Owner | — | Waits on a preview deployment. Local nginx: forged `X-Forwarded-For` ignored. |
| 7 | Preview routing and headers | BLOCKED | Owner | — | Waits on a preview deployment; local nginx image verified (runbook §12 lists the checks). |
| 8 | Meta Events Manager validation | BLOCKED | Owner | — | Waits on a preview and the privacy approval (10). Final audit (2026-11-11): the real `fbevents.js` (v2.9.439) was run locally under the production CSP with delivery blocked; one defect fixed (SPA PageViews were dropped by the library). **Delivery to Meta still unconfirmed.** |
| 8a | Automatic Advanced Matching is **ON** in Events Manager | OPEN | Owner | — | Pixel `4858424197723199`'s live config (fetched 2026-11-11) opts into `AutomaticMatching`, `AutomaticMatchingAI` and `AutomaticMatchingRegex`. No `ud[…]` data was sent in the tested flows, but the approved approach is **off**: Events Manager → Settings → Automatic advanced matching → off, then re-check. |
| 9 | Deploy-order control on merge | OPEN | Owner | — | Merging `main` starts Render and Vercel; turn Render auto-deploy off for the release (runbook §7). |
| 10 | Privacy and retention approval | OPEN | Owner / legal | — | [PRIVACY_AND_RETENTION.md](PRIVACY_AND_RETENTION.md). |
| 11 | Payment / EMI content approval | OPEN | Owner | — | Section 2, "Owner approval of Phase 5 content". |
| 12 | Canonical production domain (`VITE_SITE_URL`) | OPEN | Owner | — | Required before the production frontend build. |
| 13 | Node 24 deployment verification | BLOCKED | Owner | — | Waits on the backend release. Both images build and run on `node:24.19-alpine` locally. |
| 14 | GitHub CI run and branch protection | BLOCKED | Owner | — | Waits on authorisation to push. Workflow rehearsed locally; action SHAs match their tags. |
| 15 | Search Console / sitemap submission | BLOCKED | Owner | — | Waits on 12 and the production release. |
| 16 | Production monitoring | OPEN | Owner | — | [OBSERVABILITY.md](OBSERVABILITY.md); runbook §14. |
| 17 | Catalogue image reconciliation | OPEN | Owner | — | Production rows keep their remote image URLs (the seeder never touches unmanaged rows), so local AVIF/WebP images do not reach production by deploying alone. |
| 18 | Unsplash+ photos (3 trip pages, also their link previews) | OPEN | Owner | — | Licence decision; [IMAGE_ASSETS.md](IMAGE_ASSETS.md#unresolved--needs-a-decision). |

## 1. Credentials in Git history (audit finding ZT-01, P0)

The audit found a database credential and admin account credentials in the
repository's Git history. Their values are deliberately not reproduced here or
anywhere else; the files and commits are listed in the audit report. Deleting
the files later did not remove them: every clone, fork and cached view of the
history still holds them.

- [ ] **Database.** Find out whether the credential from history still opens any
      database (production, staging, old instances). If it does, rotate it at
      the provider — or create a new user and drop the old one — update
      `DATABASE_URL` on Render, redeploy, confirm `/api/ready`, then confirm the
      old credential is refused.
- [ ] **Admin accounts.** From a trusted machine with the production
      `DATABASE_URL`, run `node create-admin.js list`. Disable
      (`node create-admin.js disable <user>`, which also ends their sessions) or
      remove every account whose credentials appeared in history, and reset any
      remaining account that may have shared those passwords.
- [ ] **Signing secrets.** If `JWT_SECRET` or `JWT_REFRESH_SECRET` was ever in
      history or shared, set new values on Render (this signs every admin out).
- [ ] **Provider secrets.** Review the environment variables on Render and
      Vercel and the users on the database provider; remove anything unused.
      Turn on MFA for GitHub, Render, Vercel, the database provider and the
      domain registrar.
- [ ] **Repository exposure.** Check whether the repository is or ever was
      public, who has access, its forks, deploy keys and stored secrets, and
      which branches and tags still contain the affected commits.
- [ ] **History cleanup decision.** Decide whether to rewrite history (for
      example with `git filter-repo`). Do it only **after** rotation, coordinate
      it with everyone who has a clone because every commit hash changes, and
      ask GitHub to purge cached views. A rewrite reduces future exposure; it
      does not make a leaked credential safe again.

## 2. Before and after deploying this branch

- [ ] **Client IP behind Vercel → Render.** Run the check in
      [DEPLOYMENT.md → Client IP and rate limits](../DEPLOYMENT.md#client-ip-and-rate-limits)
      and act on the result. Until then, visitors arriving through Vercel may
      share rate-limit buckets.
- [ ] **`vercel.json` on a preview deployment.** Run the four `curl` checks in
      [DEPLOYMENT.md → Caching, missing files and security headers](../DEPLOYMENT.md#caching-missing-files-and-security-headers)
      (missing asset → 404, deep link → HTML, headers present, bundles immutable).
- [ ] **Meta Pixel.** Legal review of the privacy policy section and of the
      opt-in approach; **Automatic advanced matching off** in Events Manager;
      a Test Events run on a preview deployment, as listed in
      [DEPLOYMENT.md → Meta Pixel and consent](../DEPLOYMENT.md#meta-pixel-and-consent).
      Delivery to Meta has not been confirmed.
- [ ] **Migrations 0004 and 0005 before the Phase 4/6 code.** The server
      refuses to start without either (a deploy that skips one fails its health
      check, naming it, and the old release keeps serving). Production has not
      adopted the migration ledger yet: follow
      [DATABASE_MIGRATIONS.md → 4](DATABASE_MIGRATIONS.md) — back up, rehearse
      on a copy, adopt the baseline, then apply 0002–0005 — before merging.
      0005 is additive; its `analytics_events` index briefly blocks writes to
      that table while it builds. Nothing was run against production from this
      machine.
- [ ] **Node 24.** Render builds `backend/Dockerfile`, now `node:24.19-alpine`.
      After the deploy, confirm `/api/health` and `/api/ready` and watch the log
      for startup errors.
- [ ] **Deploy trigger.** `render.yaml` deploys `main` automatically
      (`autoDeploy: true`): merging this branch is the deployment.
- [ ] **Owner approval of Phase 5 content.** Wording that replaced unverified
      claims, to confirm or replace with verified business information:
      - the payment policy subtitle, its "Support hours" line (in place of
        "3 Methods / 24/7 / 100% Secure") and its bank-transfer warning;
      - the No-Cost EMI page, which now invites an enquiry instead of stating
        terms;
      - a licensed photo of Goa for Corporate Tours (the card showed Dubai; it
        now shows a plain gradient);
      - the second email address on the privacy page (`info@zuriitravels.com`,
        unchanged).
      Departure batches are hand-entered text: the trip page now hides dates
      already past, but seat counts and statuses are not live data.
- [ ] **Catalogue caching.** Public catalogue responses are cacheable for 60 s
      (plus up to 5 min stale-while-revalidate); an admin edit can take about
      6 minutes to reach a returning visitor — see
      [TRAVEL_DISCOVERY.md → Caching and invalidation](TRAVEL_DISCOVERY.md#caching-and-invalidation).
      On a preview deployment, check that `/api/admin/*` responses carry
      `Cache-Control: no-store`.
- [ ] **Backup and restore rehearsal.** Before any production migration: take a
      backup, restore it into a scratch database, and confirm the restore
      opens and `node scripts/db.mjs verify` passes on it. Never rehearsed
      against production from this machine.

## 3. Phase 6 — SEO, analytics, observability, CI

- [ ] **`VITE_SITE_URL` on Vercel (Production environment only).** The public
      origin — the business decides which domain is canonical. Until it is set,
      pages have no canonical URLs and no sitemap is published
      ([SEO.md](SEO.md)).
- [ ] **Preview-deployment checks** (the routing was verified locally against
      nginx and a Vercel-rules emulator, not on Vercel itself):
      - `/about` and `/trip/<a published slug>` return their own `<title>`
        (`curl -s <preview>/about | grep '<title>'`);
      - `/no-such-page` returns **404**; `/trip/no-such-trip` returns the app
        shell, which then shows "no longer available";
      - `/international?utm_source=x` → **308** to
        `/packages?tag=international&utm_source=x`;
      - `/admin` carries `X-Robots-Tag: noindex, nofollow`;
      - the preview's `/robots.txt` says `Disallow: /`, and the production
        `/robots.txt` names the sitemap.
- [ ] **Link previews.** After the production deploy, check one trip, one
      destination and the home page in Meta's Sharing Debugger and another
      preview tool.
- [ ] **Search engines.** Verify the domain in Google Search Console and Bing
      Webmaster Tools and submit `/sitemap.xml`. Nothing was submitted, and no
      indexing outcome is claimed.
- [ ] **CI on GitHub.** Let `.github/workflows/ci.yml` run on a pull request;
      it is unverified until it has run there ([CI.md](CI.md)). Then add the
      recommended branch protection, and decide whether `render.yaml` should
      keep `autoDeploy: true`.
- [ ] **Monitoring.** Set up the uptime checks and alerts listed in
      [OBSERVABILITY.md](OBSERVABILITY.md) — in particular any
      `lead_insert_failed`. Nothing was connected.
- [ ] **Privacy and retention approval.** Legal review of the privacy
      policy's cookie section (now including the attribution paragraph) and a
      decision on the proposed retention periods in
      [PRIVACY_AND_RETENTION.md](PRIVACY_AND_RETENTION.md). No data has been
      deleted and no automatic purge exists.
- [ ] **Search overlay blur — design decision.** Opening the header search
      takes about 340 ms to paint under software rendering, entirely because of
      the full-screen backdrop blur (about 50 ms without it). Not changed:
      it is part of the approved design, and the cost on GPU-accelerated
      browsers was not measurable here.
