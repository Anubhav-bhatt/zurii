# Marketing attribution (ZT-16)

Which campaign, site or search brought a lead, recorded **first-party** and
attached to the lead when the visitor submits a form. It is not shared with
Meta or anyone else.

## What is recorded

The browser module is
[`frontend/src/services/leadAttribution.js`](../frontend/src/services/leadAttribution.js).

| Field | From | Kept |
|---|---|---|
| `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term` | The landing URL | Up to 100 characters. Dropped if it contains an email address or a 10+ digit number. |
| `referrer_host` | `document.referrer` | **Host only**, never the full URL. Your own site is not a referrer. |
| `landing_page` | The first page of the session | **Path only**, never the query string |
| `click_id_type` | `gclid` / `fbclid` in the landing URL | **Only which one was present.** The identifier value is never stored: nothing here uploads conversions, so it has no use. Without it, Google Ads auto-tagged clicks would look like organic search. |
| `attribution_channel` | Derived by the server | `paid_search`, `paid_social`, `display`, `email`, `social`, `organic_search`, `referral`, `other_campaign`, `direct` |
| `submission_source` | The form | `contact_page`, `trip_enquiry`, `plan_my_trip` |
| `bookings.destination_id` | Plan My Trip's destination | So "leads by destination" works for custom trips |

## Where it lives, and consent

- **This browsing session (`sessionStorage`), always.** It is captured before
  the app renders, because a legacy redirect would otherwise drop the landing
  URL's tags. It leaves the browser only inside an enquiry the visitor submits.
- **Across visits (`localStorage`, 30 days), only while the visitor allows
  marketing cookies.** Withdrawing consent deletes it immediately, in this tab
  and in others.
- **What a lead carries:** this session's campaign or referral. Failing that,
  with consent only, the last campaign or referral within 30 days. Otherwise
  this session's direct visit.

**No contamination between visitors.** Attribution travels inside the
visitor's own submission. The server never looks it up from analytics, so one
visitor's campaign cannot be attached to another visitor's lead.

## On the server

[`backend/lib/attribution.js`](../backend/lib/attribution.js) validates every
field independently and **never fails a lead**: a malformed value is dropped
and the enquiry is saved. A lead sent without attribution stores nothing.
Reports call that "not captured", never a guess. Attribution is part of the
idempotency fingerprint, so a retried submission still stores one lead.

**Migration `0005_lead_attribution`** adds nullable columns to `contacts` and
`bookings`, `bookings.destination_id`, and an index on
`analytics_events(created_at)`. It is additive: existing rows are not read,
rewritten or back-filled, and leads saved before it show as "not captured".
The server refuses to start without it, as it does without 0004.

## Reporting

The admin analytics dashboard has a **Campaigns & sources** section, backed by
`GET /api/admin/analytics/campaigns?days=&limit=&offset=` (authenticated,
`no-store`). It shows:

- leads by source, channel, form, and trip or destination;
- a paginated campaign table;
- a daily table of sessions, WhatsApp clicks, leads and leads marked
  confirmed.

Each lead's CRM drawer shows where that lead came from.

The figures are kept apart and labelled as what they are:

| Figure | What it means |
|---|---|
| Sessions and events | Anonymous analytics — not people, not leads |
| WhatsApp clicks | A tap on a button, not a saved lead |
| Leads | Enquiries saved in the CRM. A lead is not a booking. |
| Marked confirmed | A status staff set. It is not a verified payment. |
| Sales, revenue, ad spend, ROAS, ROI | **Not tracked.** Nothing is shown for them. |
