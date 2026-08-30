# Greenhouse Job Board source (Phase 4A)

Greenhouse is an applicant-tracking system. Many companies publish a
public job board that Greenhouse exposes over HTTP with **no API key**.

MyNextJob discovers those jobs, maps them onto the Phase 3
`NormalizedJobInput` contract, and persists them through the existing
Job Engine + `SupabaseJobStore`. The adapter never writes SQL.

See also [`JOB_ENGINE.md`](./JOB_ENGINE.md).

## Public API

No Greenhouse Job Board API key is required or accepted.

```text
GET https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs?content=true
```

`board_token` is a public identifier (example: `dscout`). It is stored
on `job_sources.external_identifier`. The adapter never hard-codes a
company token and never builds the hostname from source metadata.

Optional diagnostic:

```text
GET https://boards-api.greenhouse.io/v1/boards/{board_token}
```

returns the board/organization name. That string is for verification
only. It does not overwrite a curated `companies.name`.

Application POST credentials are unrelated. MyNextJob does not submit
Greenhouse applications.

## Mapping

| Greenhouse | Normalized / canonical |
| --- | --- |
| `job.id` | `externalId` (string). Source-posting identity. |
| `internal_job_id` | raw metadata only. Null is allowed (prospect posts). |
| `title` | display title as published |
| `location.name` | `location.text` (original text) |
| location contains Remote / Hybrid | `remoteType` remote / hybrid; otherwise `unknown` → NULL. Never infer onsite just because Remote is absent. |
| employment | `unknown` → NULL (list endpoint has no dependable field) |
| `content` | decode escaped HTML if needed → Phase 3 `sanitize-html` → `description_html` / `description_text` |
| one department | `department`; extras stay in raw payload |
| `offices` | raw payload; office name is a location fallback only when `location.name` is missing |
| `absolute_url` | `sourceUrl` and `applyUrl` (HTTP/HTTPS validation) |
| `updated_at` | raw metadata only. **Not** `publishedAt`. |
| `first_published` | not fetched in Phase 4A (no N+1 detail calls) |
| salary | always null (not scraped from description) |

`published_at` stays null until a genuine first-published value exists.
`discovered_at` is when MyNextJob first persisted the job. Later UI
should say “Found …” not “Posted …” when publication time is missing.

## Snapshot semantics

The list endpoint is the board’s current published posts.

`snapshotComplete = true` only when:

- the request succeeded
- the wrapper schema validated
- `meta.total` is absent **or** equals `jobs.length`

A `meta.total` mismatch → incomplete snapshot → **no** missing-job
lifecycle increments.

HTTP 404 (unknown board) is a source fetch error. It is **not** an
empty complete snapshot. Existing jobs stay open.

One malformed job is rejected; the rest of the board still ingests.

The full public board is fetched. Adapters do not filter by India,
skills, or the signed-in candidate.

## Company / source registry

Migration [`0006_greenhouse_sources.sql`](../supabase/migrations/0006_greenhouse_sources.sql)
seeds five live-verified QA boards. Review it before applying. It does
not create Greenhouse-specific tables.

| Company | Board token | Domain |
| --- | --- | --- |
| Dscout | `dscout` | dscout.com |
| AlphaSense | `alphasense` | alpha-sense.com |
| Turing | `turing` | turing.com |
| PayPay India | `pay2dc` | (unknown — left null) |
| Karat | `karat` | karat.com |

`source_type = greenhouse`, `enabled = true`, `sync_frequency_minutes = 15`.
No cron is installed in this phase.

## Manual sync

Requires Node 22+, Windows system CA wrapper (same as `pnpm dev`), and
for live writes `SUPABASE_SECRET_KEY` (or legacy
`SUPABASE_SERVICE_ROLE_KEY`). Never `NEXT_PUBLIC_*`.

```bash
# Fetch + normalize + fingerprint. No Supabase writes.
# Works with a board token even before 0006 is applied.
pnpm jobs:greenhouse --source=dscout --dry-run

# Persist through the Phase 3 engine (0006 + server secret required)
pnpm jobs:greenhouse --source=dscout

# Every enabled Greenhouse source, sequentially
pnpm jobs:greenhouse --all
pnpm jobs:greenhouse --all --dry-run
```

Dry-run prints counts and a short title/location sample. It does not
print descriptions or raw payloads.

Live run uses `SupabaseJobStore` and `syncJobSource`. It does not
bypass the engine.

### Idempotency check

1. Dry-run `dscout`.
2. Live-sync `dscout` once. Confirm jobs ≈ postings, `consecutive_misses = 0`.
3. Live-sync `dscout` again. Canonical job count and posting count must
   stay the same; `unchanged` should increase; `last_seen_at` updates.

Do not simulate an empty complete snapshot against live rows.

## Diagnostic SQL (server / SQL Editor only)

```sql
select count(*) as companies from public.companies;
select count(*) as jobs from public.jobs;
select count(*) as postings from public.job_source_postings;

select *
from public.source_sync_runs
order by started_at desc
limit 5;

select
  j.id,
  c.name as company,
  j.title,
  j.location_text,
  j.remote_type,
  j.status,
  j.discovered_at,
  j.published_at,
  j.apply_url
from public.jobs j
join public.companies c on c.id = j.company_id
order by j.discovered_at desc
limit 20;

select
  jsp.external_id,
  jsp.source_url,
  jsp.last_seen_at,
  jsp.active,
  jsp.consecutive_misses
from public.job_source_postings jsp
order by jsp.first_seen_at desc
limit 20;
```

`job_source_postings` is server-only (`raw_payload`). Do not expose
these queries in the product UI.

## Known limitations

- No `first_published` / salary without bounded detail enrichment
- Board intro + conclusion HTML is stored as supplied
- Employment type is unknown on the list endpoint
- Remote type is location-text only
- No job skills, matching, feed UI, cron, or apply integration
- Signup confirmation `/error` and Custom SMTP are unrelated and deferred
