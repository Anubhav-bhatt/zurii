# Travel discovery: search, listing, trip plan and caching

How visitors find trips on the public site, and the rules behind it. Written
for engineers changing these pages and for the operator who edits the
catalogue.

## Search

One search, used by the header overlay, the hero form and `/packages?q=`:
`GET /api/packages?q=…` in [`backend/routes/travel.js`](../backend/routes/travel.js).
PostgreSQL is the only search engine.

- The text is normalised (Unicode NFKC, lower case) and split into words on
  anything that is not a letter or digit, so `  KERALA `, `Kerala!` and
  `kerala's` all search for `kerala`. Up to 100 characters and 6 distinct words
  of 2 or more characters are used.
- Every word must appear, in any order, in the title, subtitle, short or full
  description, or the destination's name, country or region. `%` and `_` are
  matched literally; text with no usable word returns no results.
- With the default sort, trips whose title or destination name matches come
  first.
- An unknown place returns `200` with zero results. The page then offers to
  plan a custom trip instead.
- The header overlay waits 200 ms after the last keystroke before it asks, and
  remembers each answer for 60 s (30 queries), so retyping a query does not
  repeat the request.

## The `/packages` listing

- **Pages.** The server returns 24 trips per page with the exact total
  (`meta.total`); `?page=2` is in the URL. The API caps `limit` at 100 and
  `offset` at 10,000. A page past the end says so and links back to page 1.
- **URL state.** Filters and sort live in the URL (`q`, `destination`, `tag`,
  `tripType`, `duration`, `minPrice`, `maxPrice`, `popular`, `featured`,
  `sort`, `page`), so refresh, Back/Forward and shared links restore them.
  Changing a filter goes back to page 1. In a hand-edited URL, a non-numeric
  price or an unknown duration, sort or flag value is dropped. Other text
  reaches the API only as bound parameters.
- **Batch lookup.** Wishlist and "recently viewed" ask for their cards in one
  request: `GET /api/packages?slugs=a,b,c` (up to 50, returned in the order
  asked, unknown slugs left out).

## The trip plan (month, travellers, budget)

The hero form's **Month** and **Travellers** fields describe the visitor's trip;
they are not properties of a package. The catalogue holds no availability or
departure data, so the site never filters on them or claims availability.

- They travel in the URL (`month=May&travellers=3-4`) and in this tab's
  `sessionStorage` (`zurii_trip_plan`). The listing shows them as "Your plan"
  and says they do not filter.
- Every enquiry form starts from the plan: the trip enquiry notes the month
  (the visitor can remove it) and pre-fills travellers. Plan My Trip pre-selects
  the destination, month and budget. They reach the lead as labelled lines in the
  message (`Destination: Kashmir | Preferred month: May`).
- A destination page's **Plan My Trip** links to
  `/plan-my-trip?destination=<slug>`, so the destination survives refresh.
- **Budget** is the only plan field that filters (`minPrice`/`maxPrice`).
  "Any budget" adds no price filter.

## Caching and invalidation

| Response | `Cache-Control` |
|---|---|
| Public catalogue `GET`s that succeed: package list, package detail, destination list and detail | `public, max-age=60, stale-while-revalidate=300` |
| Every other `GET`/`HEAD` under `/api` (errors, 404s, health, leads), and everything under `/api/admin` and `/api/auth` | `no-store` |
| Other `POST`s (enquiries, analytics) | none set |

The catalogue routes only ever return published content and read no cookies
or credentials. Their responses are identical for every visitor and safe for
shared caches. Admin and lead data are never cacheable.

**Invalidation is by time; there is nothing to purge.** After a package or
destination is edited in the admin:

- A visitor who has not loaded that page in the last minute sees the change
  at once.
- A visitor who loaded it within the last minute keeps their copy until it is
  60 s old.
- For the next 5 minutes, their browser may show the old copy once while it
  fetches the new one in the background.

The worst case is about 6 minutes for a returning visitor. For an urgent
correction (a wrong price), ask anyone checking to hard-refresh.

`POST` responses carry no `no-store`: Chrome holds the connection of a
fire-and-forget request open until a `no-store` body has been read, which
stalled the analytics beacons.

## Back, Forward and scroll

[`ScrollToTop`](../frontend/src/components/ScrollToTop.jsx) owns scrolling on
navigation; the browser's own restoration is off.

- **A new page** opens at the top, at once. The site's
  `scroll-behavior: smooth` is for in-page anchors only.
- **Back and Forward** return to where the visitor was on that entry. The
  position is retried for up to 3 s while the page's data loads, and any
  scroll input from the visitor cancels it.
- **A change to filters, sort or search on the same page** keeps the position.
- Positions are kept per history entry in `sessionStorage`
  (`zurii_scroll_positions`, last 50 entries).

## Database protections

- Every application query is limited to 15 s (`statement_timeout`), and an
  idle open transaction to 30 s, from
  [`backend/db/pool.js`](../backend/db/pool.js).
- **Leads before analytics.** At most 3 analytics inserts run at once, with up
  to 50 waiting; beyond that an event is dropped with `503 ANALYTICS_BUSY`.
  Page-view tracking can therefore never take the connections an enquiry
  needs. Enquiries are never gated.
- During a database outage the API answers **503** with `Retry-After` and a
  plain sentence (Phase 6; never the database's own message), and the public
  pages show "We couldn't load this right now" with **Try Again**, never
  "0 trips". The enquiry form keeps what the visitor typed and sends no Meta
  `Lead`.

## Images on high-density phones

Each `<source>` gets extra `sizes` entries for screens of 2.5 dppx or more,
which ask for a rendition 2/3 as wide, about 2× instead of 3×
([`imageSizes.js`](../frontend/src/utils/imageSizes.js)). The browser picks
a smaller existing file: no image was re-encoded and no published URL
changed.
