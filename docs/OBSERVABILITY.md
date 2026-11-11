# Logging and monitoring (ZT-12)

## The log format

The backend writes **one JSON object per line**: `info` to stdout, `warn` and
`error` to stderr. Render, Docker and any log shipper can then filter on
fields instead of parsing text. Set the level with `LOG_LEVEL` (`debug`,
`info`, `warn`, `error`; default `info`).

```json
{"ts":"2026-11-10T17:59:16.913Z","level":"info","event":"request","reqId":"7c3350c2-…","method":"GET","route":"/api/packages","status":200,"ms":13.2,"outcome":"ok"}
```

The code is [`lib/logger.js`](../backend/lib/logger.js) and
[`middleware/requestLog.js`](../backend/middleware/requestLog.js).

### Request ids

Every request has an id:

- the caller's `X-Request-Id` when it is a short opaque token (8–64 characters
  of `A–Z a–z 0–9 . _ -`);
- otherwise a new UUID.

It is returned in the `X-Request-Id` response header and appears on every line
written for that request. A visitor's "it failed at 10:42" can then be matched
to the server's reason.

### Events

| Event | Level | When |
|---|---|---|
| `request` | `info` (ok, client_error), `warn` (rate_limited), `error` (server_error) | Every response. `route` is the **matched pattern** (`/api/packages/:slug`), or the router's mount (`/api/admin/leads/*`) when middleware answered. It is never the raw URL or its query string. Successful `/api/health` and `/api/ready` probes are not logged. |
| `handler_error` | `error` | A route caught something it did not expect. Fields: `context`, `errName`, `errCode`, scrubbed `errMessage`, `dbClass`; `stack` (frames only) when it was not a database outage. |
| `unhandled_error` | `error` | Reached the final error handler |
| `lead_insert_failed` | `error` | A contact or enquiry could not be saved. The visitor saw an error and the WhatsApp alternative. |
| `rate_limited` | `warn` | A limiter refused a request. Fields: `limiter` (`lead`, `login_client`, `login_account`, `refresh`), `route`, and `count` since the process started. No IP or username. |
| `startup` / `shutdown` | `info` | Port, Node version, environment / the signal received |
| `startup_failed` | `error` | Bad configuration, an unreachable database, or a missing migration (`migration` names which). The process exits 1. |
| `db_idle_client_error`, `audit_write_failed`, `idempotency_sweep_failed` | `error` | Background failures that do not fail a request |
| `config_invalid`, `db_tls_unverified`, `admin_*`, `schema_ready` | various | Boot messages |

### Client errors versus our failures

`outcome` and `level` separate the two:

- `client_error` (4xx: validation, sign-in, not found) is expected and logged at
  `info`;
- `server_error` (5xx) is a genuine backend failure and logged at `error`;
- `rate_limited` is logged at `warn`.

`dbClass` says *why* the database failed:

| `dbClass` | Meaning | Response |
|---|---|---|
| `db_unavailable` | Connection refused, reset or terminated, or the server is shutting down | **503** with `Retry-After` and code `SERVICE_UNAVAILABLE`. The visitor sees "temporarily unavailable" and a retry. |
| `db_timeout` | `statement_timeout` (15 s) or a lock timeout fired | 503, as above |
| `db_constraint` | An integrity violation, usually input that validation missed | 500 |
| `db_query` | Any other PostgreSQL error — our bug | 500 |

No response ever names the database, a table or an error code.

### What is never logged

- passwords, JWTs, refresh cookies, `Authorization` headers and any other
  request headers;
- database URLs and credentials;
- request bodies (form fields) and query strings.

Two rules enforce this:

1. Keys such as `password`, `token`, `cookie`, `email`, `phone`, `name`,
   `message`, `query` and `headers` are written as `"[redacted]"`.
2. Every free-text value is scrubbed of email addresses, phone-like numbers,
   JWTs, bearer tokens and `postgres://` URLs. A PostgreSQL error such as
   `Key (email)=(…)` cannot leak a customer's address.

A test drives the real server with a password, a bearer token, a refresh
cookie, a form and a search, and asserts none of them reach the output
(`backend/tests/observability.test.mjs`).

## Health and readiness (unchanged)

| Endpoint | Meaning |
|---|---|
| `GET /api/health` | The process is up |
| `GET /api/ready` | It can reach PostgreSQL. 503 when it cannot. |

## Monitoring and alerting — recommended, not connected

Nothing in Phase 6 connects to a monitoring service or creates credentials for
one. What to set up, in any provider:

| Signal | How | Suggested threshold |
|---|---|---|
| Site down | External uptime check on `/api/ready` and on the home page | 2 consecutive failures, from 2 locations |
| Database outage | Count of `dbClass:"db_unavailable"` | Any in 5 minutes |
| Backend errors | Count of `level:"error"` with `event:"request"` | More than 5 in 10 minutes, or above 1 % of requests |
| Lost enquiries | `event:"lead_insert_failed"` | **Any** — each one is a visitor who could not send an enquiry |
| Rate limiting during a campaign | `event:"rate_limited"` with `limiter:"lead"` | More than 10 in 10 minutes: visitors may share an address (see DEPLOYMENT.md → Client IP) |
| Sign-in attacks | `limiter:"login_client"` or `"login_account"` | A sudden burst |
| Slow requests | `ms` on `event:"request"` | p95 above 1 s for 10 minutes |
| Bad deploy | `event:"startup_failed"` | Any |

On Render, these fields are searchable in the log explorer. A log drain can
forward them to any provider that accepts JSON lines.
