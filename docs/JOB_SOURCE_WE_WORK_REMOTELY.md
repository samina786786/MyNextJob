# We Work Remotely RSS source (Phase 4D)

We Work Remotely is a public remote-job board. It publishes an official
**all-jobs RSS feed** with **no API key**.

MyNextJob discovers those listings, maps them onto the Phase 3
`NormalizedJobInput` contract, and persists them through the existing
Job Engine + `SupabaseJobStore`. The adapter never writes SQL and never
scrapes HTML listing pages.

See also [`JOB_ENGINE.md`](./JOB_ENGINE.md).

## Official source

```text
GET https://weworkremotely.com/remote-jobs.rss
```

No authentication. Category feeds are **not** ingested in Phase 4D —
they overlap the global feed.

## Attribution

WWR asks consumers to attribute links back to We Work Remotely.

- Canonical `sourceUrl` is the WWR listing URL
- Phase 4D `applyUrl` is the same WWR listing URL
- The adapter does not scrape employer apply URLs from HTML or
  description links

Phase 5 should display: `Source: We Work Remotely` with that URL.

## Aggregator model

WWR is the **publisher**, not the employer.

`job_sources.company_id` is **NULL**. We do not insert a We Work Remotely
row into `companies`. Each RSS item supplies its own employer name.
Canonical `jobs.company_id` is resolved through generic company
resolution: domain → exactly one `name_key` → create.

Greenhouse, Lever, and Ashby still pass an explicit `companyId` and
keep their configured employer.

## Identity

Prefer `<guid>` (often the WWR URL). If guid is absent, a validated
`weworkremotely.com/remote-jobs/{slug}` `<link>` may be used. Title,
company, location, and `pubDate` are never hashed into identity.

## Mapping

| RSS | Normalized / canonical |
| --- | --- |
| `Company: Title` | employer name + display title (first colon); XML character references decoded for plain text (`&amp;` → `&`) |
| `region` / `country` | location text; country only when it is clearly one country |
| (board context) | `remoteType = remote` — not worldwide |
| `type` | conservative employment mapping |
| `pubDate` | `publishedAt` when parseable |
| `description` | Phase 3 sanitizer |
| `link` | `sourceUrl` and `applyUrl` |
| `category` / `skills` / `expires_at` | raw payload (and category → department) |

No salary parsing from title/description. `expires_at` is preserved in
raw payload only — no WWR-specific expiry column.

## Snapshot completeness

Live inspection (2026-08-30):

- RSS: **90** items, ~844 KiB, `application/rss+xml`
- Public `/remote-jobs` HTML contained **187** `/remote-jobs/…` listing hrefs

The global RSS is **not** a complete active-job snapshot.
`snapshotComplete` is therefore **always false**. Missing-job lifecycle
must not close WWR jobs because they disappeared from RSS.

Do not compensate by unioning category feeds in this phase.

## Manual sync

```bash
pnpm jobs:wwr --dry-run
pnpm jobs:wwr --source=weworkremotely-all --dry-run
pnpm jobs:wwr
```

Dry-run does not create companies. Live run uses `SupabaseJobStore`.

## Known limitations

- Feed is recent/partial, not the full board
- Employer is parsed from `Company: Title` (no dedicated employer tag)
- RSS plain-text fields decode only safe XML character references;
  description HTML still goes through the Phase 3 sanitizer
- Apply URL stays on WWR
- Live unchanged sync is sequential per job/company (~122s for 90
  unchanged jobs). Phase 5 should batch/prefetch company resolution and
  posting/job lookups without changing correctness.
- No job skills, matching, feed UI, cron, or HTML scraping
- Signup confirmation `/error` and Custom SMTP are unrelated and deferred
