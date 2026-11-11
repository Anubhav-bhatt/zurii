# Lead management

One admin CRM for every enquiry the site collects. Added in Phase 4; the code
is `backend/lib/leads.js`, `backend/routes/leads.js`,
`backend/lib/idempotency.js` and `frontend/src/components/admin/leads/`.

## Architecture

The public forms still write to the tables they always wrote to — nothing was
merged, renamed or dropped:

| Form | Table | Lead kind |
| ---- | ----- | --------- |
| Contact Us | `contacts` | `contact` |
| Enquire on a trip page | `bookings` (with `package_id`) | `trip` |
| Plan My Trip | `bookings` (no package) | `custom` |

`backend/lib/leads.js` projects both tables onto one model with a `UNION ALL`
and is the only code that changes a lead. Every lead has a stable id made of
its table and its original database id — `contact-12`, `booking-34` — so the
original ids, package link, timestamps and attribution ids are all preserved.
A trip enquiry whose package was later deleted (`package_id` is
`ON DELETE SET NULL`) reads as `custom`.

## Status model

| Status | Meaning | `contacts.status` (legacy) | `bookings.status` |
| ------ | ------- | -------------------------- | ----------------- |
| `NEW` | not yet handled | `pending` (or `new`, or anything but `completed`) | `NEW` |
| `CONTACTED` | the team has reached the customer | `pending` | `CONTACTED` |
| `INTERESTED` | the customer is engaged / evaluating | `pending` | `INTERESTED` |
| `CONFIRMED` | the trip is booked | `completed` | `CONFIRMED` |
| `CLOSED` | handled, nothing further to do | `completed` | `CLOSED` |
| `CANCELLED` | the customer withdrew, or the lead was lost | `completed` | `CANCELLED` (new) |

- **No stored value was rewritten.** Bookings already used these names;
  migration 0004 only widens `bookings_status_check` to accept `CANCELLED`,
  which the old CRM offered and the database refused.
- **Contacts keep their legacy column.** The unified value is stored in the new
  `contacts.lead_status`. While it is `NULL` (every contact before Phase 4) the
  status is derived: `completed` → `CLOSED`, anything else → `NEW`. When an
  admin sets a status, `lead_status` is written and `status` is set to the
  matching legacy value from the table above, so anything still reading
  `status` stays truthful.
- "Open" means `NEW`, `CONTACTED` or `INTERESTED`; "Completed" means
  `CONFIRMED`, `CLOSED` or `CANCELLED`. The CRM's "Complete" button sets
  `CLOSED`; "Reopen" sets `NEW`.

## Admin API

All routes require a full admin session (`requireAuth`): a valid access token
whose `token_version` matches, an active account, and no outstanding
password change (`403 PASSWORD_CHANGE_REQUIRED`). Responses use the usual
envelope; errors are `{ success: false, error, code }`.

| Route | Purpose |
| ----- | ------- |
| `GET /api/admin/leads` | Paginated list. Query: `kind` (`all`\|`contact`\|`trip`\|`custom`), `status` (`all`\|`open`\|`done`\|a status\|a comma list), `priority` (`all`\|`high`\|`normal`), `q` (name, email, phone digits, interest, trip, message; ≤ 100 chars), `interest`, `from`/`to` (ISO instants), `deleted` (`exclude`\|`only`), `sort` (`newest`\|`oldest`\|`name_asc`\|`name_desc`), `page` (≥ 1), `pageSize` (1–100, default 25). Returns `data: [lead]` and `meta: { page, pageSize, total, totalPages, sort, filters }`. |
| `GET /api/admin/leads/summary` | Counts over **all** matching active leads: `total`, `byKind`, `byStatus`, `open`, `done`, `receivedSince` (since `since`, default midnight server time), `deleted`, and the 50 commonest contact `interests`. Accepts the list's `q`, `interest`, `priority`, `from`, `to`. |
| `GET /api/admin/leads/:leadId` | `{ lead, notes, activity }`. The lead includes every stored field, `legacyStatus`, `legacyNote` (the old single `bookings.admin_notes` text, shown as is) and the deletion details. |
| `PATCH /api/admin/leads/:leadId/status` | `{ status, expectedStatus? }` → `{ leadId, status, previousStatus, changed, activity }`. `409 STATUS_CONFLICT` with `currentStatus` when `expectedStatus` is stale; `409 LEAD_DELETED` for a deleted lead. Setting the current status again is a no-op. |
| `POST /api/admin/leads/:leadId/notes` | `{ body }` (1–2000 chars) → `201 { note, activity }`. |
| `DELETE /api/admin/leads/:leadId` | `{ reason? }` (≤ 500 chars) → soft delete. `409 ALREADY_DELETED`. |
| `POST /api/admin/leads/:leadId/restore` | Undo a soft delete. `409 NOT_DELETED`. |

A malformed id is `400 INVALID_LEAD_ID`, an unknown one `404 LEAD_NOT_FOUND`,
invalid input `400 INVALID_INPUT` (with `field`), and an unreachable database
`503 SERVICE_UNAVAILABLE` with `Retry-After`. Other failures are a generic
`500`; logs carry the error message only, never request bodies.

**Concurrency.** Every change locks the lead row for its decision and writes
its history row in the same transaction. The CRM always sends
`expectedStatus`, so when two admins change one lead at once the second is
told (409) and shown the current status instead of silently overwriting it.

**Legacy routes** keep their URLs and response shapes:
`GET /api/contact` (now excludes deleted leads),
`PATCH /api/contact/:id/complete` (→ `CLOSED`), `…/reopen` (→ `NEW`), and
`DELETE /api/contact/:id`, which is now a soft delete. All three changes go
through the lead service and are recorded with `details.via = 'legacy-api'`.

## Notes and activity

- `lead_notes`: internal notes — author (id and username at the time) and
  timestamp. There is no edit or delete.
- `lead_activity`: `status_changed` (from → to), `note_added` (note id only;
  the text is not copied), `deleted` (with the reason) and `restored`, each
  with who and when. The submission itself is shown as "Enquiry received"
  from the lead's `created_at`.
- Both are **append-only in the database**: a trigger refuses `UPDATE`,
  `DELETE` and `TRUNCATE`, and their foreign keys are `ON DELETE RESTRICT`, so
  a lead with history cannot be hard-deleted by accident. Deliberate
  maintenance (removing synthetic test data, an approved retention job) must
  opt in inside its own transaction with
  `SET LOCAL zurii.lead_history_maintenance = 'on'`. This guards against
  mistakes in application code; it is not a tamper-proof ledger against
  someone who controls the database.
- Nothing sensitive is stored there: no passwords, tokens or form contents.

## Deletion and recovery (ZT-10)

Deleting a lead — from the CRM or the legacy route — sets `deleted_at`,
`deleted_by` and an optional `delete_reason`; the row and its history stay.
Deleted leads are excluded from every normal list, from the analytics lead
counts and from the legacy contact list. The CRM's **Deleted** tab lists them
and any admin can restore one; both actions are recorded. No migration deletes
anything.

## Duplicate submissions

The Contact Us, trip enquiry and Plan My Trip forms send an `Idempotency-Key`
header: a random UUID per submission attempt
(`frontend/src/services/submissionKey.js`). Sending again with the same
contents — a double click, a retry after a timeout, or the visitor pressing
Send after an uncertain response — reuses the key; editing the form or a
successful send starts a new one, so a genuinely new enquiry is never
suppressed.

The server (`backend/lib/idempotency.js`) claims the key in the same
transaction that inserts the lead:

| Situation | Result |
| --------- | ------ |
| first request | lead stored, `201` |
| the same key again, same contents | the same `201` and lead id, `Idempotent-Replayed: true` — nothing stored |
| simultaneous requests with one key | one lead; the others wait and get the same `201` |
| the first attempt failed (validation, database) | nothing was kept, so the retry creates the lead |
| same key, different contents | `422 IDEMPOTENCY_KEY_REUSED`, nothing stored |
| malformed key | `400 INVALID_IDEMPOTENCY_KEY` |
| no key (older clients) | exactly the old behaviour |

Keys expire after 24 hours and are swept hourly. Only the key, a SHA-256 of
the submission and the lead id are stored. The Meta `Lead` event still fires
only after the server confirms the save, so a replayed success produces one
`Lead` in the browser that receives it, and a failed request produces none.

## Database

Migration `backend/db/migrations/0004_lead_management.sql` (additive):
`contacts.lead_status`, `deleted_at`/`deleted_by`/`delete_reason` on both
tables, the widened `bookings_status_check`, partial indexes for the
newest-first active lists, and the tables `lead_notes`, `lead_activity` and
`lead_idempotency_keys`.

The server does not migrate itself. At startup it checks for these objects
(`backend/db/leadSchema.js`) and exits with a clear message if they are
missing, so a deploy that skipped the migration fails its health check while
the previous release keeps serving. See
[DATABASE_MIGRATIONS.md](DATABASE_MIGRATIONS.md) for applying it.
