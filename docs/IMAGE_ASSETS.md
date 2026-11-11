# Travel images

Travel photographs are hosted by the site itself, as responsive AVIF/WebP
renditions with a JPEG fallback. This page explains where they live, how they
are produced, the licence rules, and how to add or replace one.

## What is where

| Path | What it is |
|---|---|
| `frontend/public/assets/travel/v1/<asset-id>/` | The published files: `<width>.avif`, `<width>.webp`, one `<width>.jpg` fallback (or `avatar.svg`) |
| `frontend/public/assets/brand/v1/` | The logo at 36/72/108/144 px, lossless WebP + PNG |
| `tools/images/` | The pipeline that produces them (its own `package.json`; nothing here ships to users) |
| `tools/images/manifest/image-manifest.v1.json` | **The image manifest**: original identifier → local asset, every rendition (size, bytes, SHA-256), every place it is used, and the unresolved list |
| `tools/images/manifest/brand-manifest.v1.json` | The same record for the logo files |
| `tools/images/manifest/remote-baseline.v1.json` | Bytes the original remote URLs returned, measured once before the migration |
| `frontend/src/data/travelImages.generated.js` | Generated lookup the browser uses to build `srcset` (asset id → dimensions and widths) |
| `backend/db/catalogue/catalogue.v2.json` | The catalogue the database is seeded from, with local image references |
| `backend/db/catalogue/image-references.v2.csv` | Every image reference currently in `zurii_dev` (`npm run db:dev:images`) |

`frontend/public/zurii-logo.png` is kept as the logo master (the README embeds
it). The site no longer loads it.

## How a photo reaches the page

```
frontend/src/data/index.js ──catalogue:export──▶ catalogue.v1.json   (original remote identifiers)
                                                      │
                          tools/images  npm run build │  inventory → licence check → guarded download → renditions
                                                      ▼
                                  image-manifest.v1.json + public/assets/travel/v1/…
                                                      │
                             backend  catalogue:localize
                                                      ▼
                                        catalogue.v2.json ──db:dev:seed──▶ database ──API──▶ <ResponsiveImage>
```

- The database and the API carry **one string per image**: the path of its JPEG
  fallback, e.g. `/assets/travel/v1/dest-bali-592e3f05/1280.jpg`. That is a
  complete, working image reference on its own.
- `ResponsiveImage` (`frontend/src/components/ui/`) recognises that path, looks
  the asset up in the generated module, and renders `<picture>` with AVIF and
  WebP `srcset`s, `sizes`, intrinsic `width`/`height`, and the JPEG as `<img src>`.
- Any other reference — a remote `https://` URL, or a local path the manifest
  does not know — renders as a plain `<img>`. Nothing has to be migrated for a
  page to keep working.
- If a rendition fails to load, the component retries once with the plain JPEG
  before reporting the error; `SmartImage` then shows its placeholder.

`SmartImage` (fixed-ratio card with a placeholder) delegates to
`ResponsiveImage`. Pass `sizes` wherever the image is narrower than the
viewport, and `priority` only for the one image that is the page's main visual.

## Renditions

| Role | Used for | Widths |
|---|---|---|
| `hero` | destination images, package covers | 320, 640, 960, 1280, 1920 |
| `standard` | gallery, blog and corporate photos | 320, 640, 960, 1280 |
| `avatar` | testimonial avatars | the original SVG |

AVIF quality 50 (4:2:0), WebP quality 76, JPEG quality 80 (mozjpeg,
progressive); Lanczos3 resampling; never upscaled; aspect ratio preserved.
Masters are fetched as 2000 px JPEGs (quality 90) and cached in
`tools/images/.cache/` (ignored by Git). The exact recipe and tool versions are
recorded in the manifest.

## Licence rules

A source is migrated only when its licence positively allows self-hosting.
The decision is made per source in `tools/images/lib/sources.mjs`; anything
unrecognised is excluded.

| Source | Decision | Basis (checked 2026-11-10) |
|---|---|---|
| `images.unsplash.com/photo-…` | Migrated | [Unsplash License](https://unsplash.com/license): free to download, copy, modify, distribute and use commercially |
| `plus.unsplash.com/premium_photo-…` | **Not downloaded** | Unsplash+ License — rights depend on a subscription that has not been evidenced |
| `api.dicebear.com/7.x/avataaars/svg` | Migrated | [DiceBear licences](https://www.dicebear.com/licenses/): Avataaars is "free for personal and commercial use". The designer's own page could not be read on the check date (expired certificate) — worth re-confirming |
| Anything else | Not downloaded | No licence established |

### Unresolved — needs a decision

Two Unsplash+ photographs are still loaded from Unsplash (the original URL is
kept, so the pages keep working):

| Photo | Used by |
|---|---|
| `premium_photo-1661962428918-6a57ab674e23` | `jaisalmer-desert-safari` (cover, gallery 1), `dubai-luxury` (gallery 4) |
| `premium_photo-1697730398251-40cd8dc57e0b` | `rishikesh-adventure` (cover, gallery 1), `rishikesh-mussoorie-family` (cover), `mussoorie-nainital-rishikesh-family` (gallery 4) |

Either replace them with photographs under the Unsplash License (or your own),
or keep written evidence of an Unsplash+ subscription that covers this use and
add the source to `LICENCES`. The manifest's `unresolved` list is the
authoritative record.

## Commands

```bash
# one-time
cd tools/images && npm ci

# rebuild everything that changed (idempotent: cached masters, no re-encoding of unchanged assets)
npm run build
npm run verify            # files ↔ manifest ↔ references ↔ built bundle; exits non-zero on any problem

# carry the result into the catalogue and the local database
cd ../../backend
npm run catalogue:localize
npm run db:dev:seed -- --dry-run     # review
npm run db:dev:seed
npm run db:dev:verify
```

`npm run verify` also checks `frontend/dist` when it exists — run it after
`npm run build` in `frontend/` before any release.

## Adding or replacing a photo

1. Change the reference in `frontend/src/data/index.js` (catalogue, blogs,
   testimonials) to the new source URL. Use a source from the table above.
2. `cd backend && npm run catalogue:export`
3. `cd tools/images && npm run build && npm run verify`
4. `cd backend && npm run catalogue:localize && npm run db:dev:seed`
5. Commit the new files under `frontend/public/assets/travel/v1/`, both
   manifests' changes, the generated module and the catalogue artifacts together.

The seeder updates only rows nobody has edited since they were seeded; edited,
deleted and pre-existing rows are reported and left alone
(see [DATABASE_MIGRATIONS.md](DATABASE_MIGRATIONS.md)).

## Rules that must hold

- **A published URL never changes its bytes.** The nginx image serves `/assets/`
  with a one-year `immutable` cache, and any CDN in front may do the same. The
  asset id ends in the master's content hash, and `v1` is the recipe version:
  change the recipe → publish under `v2`.
- **A missing file is silent.** The host answers an unknown path with the app's
  `index.html` and HTTP 200, so the browser sees a broken image and no log shows
  a 404. `npm run verify` is the guard; do not skip it.
- **No machine paths.** References are site-relative (`/assets/…`) or `https://`.
  The catalogue validator rejects anything else.
- **No silent licence changes.** A new image host must be added to `LICENCES`
  with its evidence before the pipeline will download from it.

## Known limits

- The published renditions add about 100 MB to the repository and to each
  deploy. If that becomes a problem, the largest saving is dropping the
  1920 px WebP files (AVIF already covers that size for current browsers).
- `frontend/vercel.json` sets no cache header, so on Vercel these files are
  revalidated on every use (the platform default for static files). Because the
  paths are versioned, a long-lived `Cache-Control` for `/assets/travel/*` and
  `/assets/brand/*` is safe to add. That is a deployment change and has
  deliberately not been made.
- Remote `https://` images (the two above, or any added later without running
  the pipeline) are shown at whatever size their URL returns — no `srcset`.
- Four unused data files under `frontend/src/data/` still mention remote URLs.
  They are not imported, so nothing in the bundle loads them.
