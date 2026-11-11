# SEO: crawlable pages, sitemap and indexing (ZT-17)

The site is a React single-page app. Before Phase 6 every URL returned the same
HTML with the title "Zurii". Search engines that run JavaScript could still
read the pages. Link-preview bots (WhatsApp, Facebook, X, Slack, LinkedIn) and
other non-JavaScript crawlers could not.

## How it works

**At build time, each public page gets its own static HTML.**
`npm run build` runs `vite build` and then
[`frontend/scripts/prerender.mjs`](../frontend/scripts/prerender.mjs). It reads
the approved catalogue artifact (`backend/db/catalogue/catalogue.v2.json`: only
published packages and active destinations), the travel guides and the site
config, and writes:

| File | What it is |
|---|---|
| `dist/index.html`, `dist/<route>/index.html` | Every public page: home, listings, legal pages, 36 destinations, 68 trips and 6 guides. Each has its own `<title>`, description, canonical, robots, Open Graph/Twitter tags, JSON-LD, and a `<noscript>` copy of its main content (one `h1`, then `h2`s) for crawlers that do not run JavaScript. |
| `dist/spa-fallback.html` | The app shell with neutral metadata and no canonical. It is served for a trip, destination or guide URL that has no prerendered page. |
| `dist/404.html` | `noindex`; served with status 404 for unknown URLs. |
| `dist/sitemap.xml` | Published content only. Written only when `VITE_SITE_URL` is set, because sitemaps need absolute URLs. |
| `dist/robots.txt` | Keeps crawlers off `/admin`, `/dashboard`, `/api/` and search results (`/packages?q=`). A non-production build gets `Disallow: /`. |

**The app is unchanged.** It still mounts on every page. The `<noscript>`
block is never shown when JavaScript runs.

**In the browser,** [`seo/useSeo.js`](../frontend/src/seo/useSeo.js) keeps the
same tags current as visitors navigate. It uses the same builders
([`seo/meta.js`](../frontend/src/seo/meta.js)), so the build and the app always
agree. A detail page refines its tags once its data arrives.

## Pages whose content changed after the build

Trips and destinations are prerendered from the artifact in the repository.
Something edited directly in the production database after a build behaves as
follows:

- **Added:** it has no static page. Its URL is served the app shell, which
  renders it and sets its metadata in the browser. Search engines that run
  JavaScript index it correctly; link previews show the neutral site title
  until the next build.
- **Unpublished:** its old static page is still served, with status 200. The
  app then shows "This trip is no longer available" and marks the page
  `noindex`.

Rebuilding the frontend after a catalogue change brings the static pages back
in line. Catalogue changes made through the repository and deployed already do
this.

## Status codes, honestly

| Request | Status |
|---|---|
| A public page, `/trip/<published>`, `/destination/<active>`, `/blog/<guide>` | 200, with its prerendered HTML |
| Any other path: `/foo`, `/packages/extra`, a missing asset | **404**, the noindex 404 page |
| `/trip/<anything else>`, `/destination/<anything else>`, `/blog/<anything else>` | 200 with the app shell, which shows "not found" and sets `noindex` |
| `/international`, `/best-sellers`, `/all-domestic-destinations`, `/explore/*` | **308** (Vercel) or **301** (nginx) to their `/packages?…` equivalents; campaign query strings are kept |
| `/admin…`, `/dashboard` | 200 with the app shell, `X-Robots-Tag: noindex, nofollow` |

**One genuine limitation.** On static hosting, an unknown slug under `/trip/`,
`/destination/` or `/blog/` returns 200, not 404. Returning 404 there would
also hide trips added to the database after the build, because the static host
cannot ask the database.

The page is still `noindex` once rendered, so search engines treat it as a
"soft 404". A real 404 would need an edge function that consults the API. That
is new infrastructure and was not added.

## Canonical URLs and indexing

- **Canonical:** every page points at itself. `/packages` with any filters,
  sort, page or search points at `/packages`.
- **Search results** (`?q=`) are `noindex` and disallowed in robots.txt.
- **Never indexed:** the wishlist (personal to a device), the admin, the 404 page
  and the app shell.

Three build-time settings decide this. They are read once by
[`scripts/siteEnv.mjs`](../frontend/scripts/siteEnv.mjs), for both the app and the
prerender:

| Variable | Effect |
|---|---|
| `VITE_SITE_URL` | The canonical origin, e.g. `https://www.example.com`. **No domain is assumed.** Unset: no canonical, no `og:url`, no absolute `og:image`, no sitemap; everything else works. |
| `VERCEL_ENV` | Set by Vercel. `preview` and `development` builds are `noindex` on every page, and robots.txt disallows everything. |
| `SITE_NOINDEX=true` | The same for any other non-production build, such as a Docker staging stack. |

An unset `VITE_SITE_URL` deliberately does **not** make a production build
`noindex`. That would de-index the live site if the variable were forgotten.

## Structured data

JSON-LD carries only what the site already publishes:

| Page | JSON-LD |
|---|---|
| Home | `TravelAgency`: name, URL, logo, email, the first phone number, the printed address (street and PIN code only — no city or country added), Instagram |
| Destination | `BreadcrumbList` and `TouristDestination` |
| Trip | `BreadcrumbList` and `TouristTrip` |
| Guide | `BlogPosting`, with the date and author the guide states |

There are deliberately **no** ratings, reviews, prices, offers, availability or
awards. The catalogue has rating and review-count fields, but they are not
verified data.

## Hosting

The same rules exist twice, in the same order:

| Rule | Vercel ([`vercel.json`](../frontend/vercel.json)) | nginx ([`nginx.conf`](../frontend/nginx.conf)) |
|---|---|---|
| Legacy redirects | `redirects` (308) | `return 301` with the visitor's query string, relative `Location` |
| Prerendered pages | Served from the filesystem; `/about` → `about/index.html` | `try_files $uri $uri/index.html` |
| Detail fallback | `rewrites` → `/spa-fallback.html` | `try_files $uri/index.html /spa-fallback.html` |
| Admin | Rewrite + `X-Robots-Tag` header | `try_files /spa-fallback.html` + `X-Robots-Tag` (map on the request URI) |
| Unknown URLs | Vercel serves `404.html` with 404 | `try_files … =404` + `error_page 404 /404.html` |
| HTML caching | `Cache-Control: no-cache` | `map` on the content type: `no-cache` |
| Assets | Immutable, unchanged | Immutable, unchanged |

**Verified locally:**

- **nginx:** the real `nginx:1.27-alpine` image, with the built site and the
  templated config.
- **Vercel:** an emulator of Vercel's documented routing order (redirects,
  filesystem, rewrites, 404 page).

Real Vercel behaviour must be confirmed on a preview deployment
([OPERATOR_ACTIONS.md](OPERATOR_ACTIONS.md)).

## Checking it

```sh
cd frontend
VITE_SITE_URL=https://example.org npm run build
npm run check:seo -- https://example.org   # what crawlers receive, from dist/ (also in CI)
```

`check:seo` fails if any of these is wrong:

- a sitemap URL has no page;
- a page lacks a unique title, a description of 40–170 characters, exactly one
  canonical equal to its sitemap URL, `index, follow`, Open Graph tags or
  exactly one `h1`;
- JSON-LD does not parse;
- the sitemap lists private, search or query URLs;
- the 404 page or the app shell could be indexed.

## Not done here

These belong to the operator (see [OPERATOR_ACTIONS.md](OPERATOR_ACTIONS.md)):

- submitting the sitemap to Google Search Console or Bing;
- verifying the domain;
- watching the coverage report.

Nothing in Phase 6 was submitted anywhere, and no claim is made about how
search engines will index the site.
