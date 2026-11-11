# Privacy and data retention — DRAFT for owner and legal review (ZT-15 / ZT-22)

**Status: proposal.** Nothing here is legal advice or a statement of
compliance. The retention periods are suggestions awaiting the owner's
decision. **No data has been deleted, and no automatic deletion exists.**

## What is stored

| Data | Where | Identifies a person? | Today |
|---|---|---|---|
| Leads: name, email, phone, message, travel details | `contacts`, `bookings` | **Yes** | Kept indefinitely. "Delete" in the CRM is a soft delete: it sets `deleted_at` and can be restored. |
| Lead attribution: UTM tags, referring host, landing path, form, channel | Same rows (migration 0005) | No (it is attached to a lead) | Kept with the lead |
| Lead notes and history | `lead_notes`, `lead_activity` | Through the lead | Append-only; kept with the lead |
| Anonymous analytics: event type, page path, referrer origin, UTM tags, random visitor and session ids | `analytics_events` | Pseudonymous | Kept indefinitely |
| Admin security audit: sign-ins, failures, IP, user agent | `admin_audit_logs` | Admins | Kept indefinitely |
| Duplicate-submission keys | `lead_idempotency_keys` | No | Expire after 24 h and are swept automatically |
| Browser storage | Theme, wishlist, visitor/session id, consent choice, attribution | — | On the visitor's device |

## Controls in place, verified by tests

- **Analytics never stores search text, a full referrer or a query string as
  sent.** The server reduces the referrer to its origin, strips query strings
  from paths, keeps only the five UTM keys, and replaces email addresses and
  phone numbers typed into search with `[redacted]`
  (`backend/lib/validateEvent.js`).
- **Lead attribution drops personal values and click-id values.** A UTM value
  containing an email or a phone number is not stored, and click identifiers
  are reduced to their type (`backend/lib/attribution.js`).
- **Withdrawing marketing consent:**
  - stops the Meta Pixel (Phase 3);
  - deletes the 30-day attribution copy from the browser (Phase 6).
  - First-party analytics continue. They are anonymous, stay with Zurii and are
    described in the privacy notice.
- **Meta never receives names, emails, phone numbers, messages or search
  terms.** There is no Conversions API and no advanced matching.
- **Logs contain no form values, passwords, tokens or query strings**
  ([OBSERVABILITY.md](OBSERVABILITY.md)).
- **Admin data is never in a shared cache.** Admin API responses are
  `Cache-Control: no-store`; the public catalogue is cached and contains no
  personal data ([TRAVEL_DISCOVERY.md](TRAVEL_DISCOVERY.md)).
- **Retention report** (read-only, counts only):

  ```sh
  cd backend && npm run db:dev:retention   # production: node scripts/db.mjs retention-report --target production (approved access only)
  ```

## Proposed retention periods — for decision

| Data | Proposal | Reasoning |
|---|---|---|
| Anonymous analytics events | **13 months** | One full year compared with the last; long enough for seasonal travel planning |
| Leads that never became a trip (NEW, CONTACTED, INTERESTED, CANCELLED, CLOSED) | **24 months after the last activity** | Repeat enquiries and follow-up; then delete or anonymise name, email and phone |
| Leads marked CONFIRMED | **As long as tax and accounting rules require** for the trip's records (owner/accountant to confirm), then anonymise | Bookings may be financial records |
| Soft-deleted leads | **90 days, then permanent deletion** | Enough to undo a mistaken deletion |
| Lead notes and history | With their lead | — |
| Admin security audit | **12 months** | Investigating account misuse |
| Browser attribution | 30 days with consent (implemented) | — |

**Before any purge exists,** the owner and legal adviser should approve:

1. these periods, or replacements;
2. delete versus anonymise for leads;
3. how a person's request for access or deletion is handled. Today it is done
   by an admin in the CRM; soft delete is not erasure.

**After approval,** the purge should be a separate, explicit operator command
with a dry-run default, run against a backed-up database, never a scheduled
job added silently.

## Privacy notice

The cookie section of the privacy policy page (marked in the code as a Phase 3
draft needing legal review) now also describes the Phase 6 attribution
paragraph. Still to review there:

- the "Last updated" date (left unchanged);
- the rights paragraph, which promises deletion "at any time";
- the second email address that page lists.
