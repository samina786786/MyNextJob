# Job source registry (Phase 5E)

`public.job_sources` is the single authoritative registry of every ATS
board / aggregator we ingest. Every runtime decision — which sources to
verify, which to sync, which to skip under backoff — reads from this
table. There is deliberately no second JSON/static registry.

See also [`JOB_ENGINE.md`](./JOB_ENGINE.md), [`DATABASE.md`](./DATABASE.md).

## Model

Existing schema from `0001_initial_schema.sql` — Phase 5E adds **no
columns**:

| Column | Role |
| --- | --- |
| `id` | Registry row identity. |
| `source_type` | Provider (`greenhouse`, `lever`, `ashby`, `we_work_remotely`, …). |
| `external_identifier` | Provider-specific identifier. Never a URL. |
| `company_id` | Canonical company binding. NULL for aggregators (WWR). |
| `name` | Human display name. |
| `enabled` | Bulk sync + verify skip disabled rows. |
| `sync_frequency_minutes` | Adapter cadence hint. |
| `last_synced_at` / `next_sync_at` | Health signals used for backoff. |
| `status` | Enum: `active` / `paused` / `error` / `disabled`. |
| `error_count` | Consecutive failures feeding backoff. |
| `metadata` | JSON provider config (e.g. `lever_instance`). |

Supported providers (adapters shipping today):
`greenhouse`, `lever`, `ashby`, `we_work_remotely`. Any other value in
`source_type` is refused at the orchestrator's validation gate.

## Provider identifier rules

Identifiers are **provider-specific tokens**, never URLs. The adapter
owns URL construction so provider hosts stay allowlisted.

| Provider | Identifier | Regex |
| --- | --- | --- |
| `greenhouse` | board token | `^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$` |
| `lever` | site slug | `^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$` |
| `ashby` | board name | `^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$` |
| `we_work_remotely` | singleton (`weworkremotely-all` — canonical from 0009 / `WWR_SOURCE_IDENTIFIER`) | fixed string |

Path traversal (`../…`), URL characters, query strings, and encoded slashes
are all rejected by [`validateSourceConfig`](../src/lib/jobs/sources/registry.ts).

## Company binding

Direct-employer sources (`greenhouse` / `lever` / `ashby`) MUST bind to a
canonical `companies.id` via `company_id`. `validateSourceConfig` refuses
a direct source with `company_id IS NULL`.

`we_work_remotely` is the only aggregator today; its source row has
`company_id IS NULL` because the employer is per-posting. The registry
grammar accepts one WWR row and refuses any additional WWR sources.

## Domain trust

`companies.domain` remains trusted identity data:

- Never inferred from a company name.
- NULL means "no verified domain" — the row is still valid, initials fall
  back on the UI.
- A verified new domain may be added when the current value is NULL. A
  conflict with an existing non-null value is refused; the operator
  resolves it manually.

## Enabled / disabled semantics

`job_sources.enabled = false` is the durable "do not sync but keep
history" state. The orchestrator skips disabled rows and reports them.
The registry never deletes historical `source_sync_runs` when a source
is disabled.

## Backoff

Reuses the existing engine helper
[`nextSyncDelayMinutes`](../src/lib/jobs/engine/backoff.ts) — success uses
the source's own cadence, failures grow exponentially capped at 24 h.
The orchestrator does not implement a second backoff scheme; it only
reads `next_sync_at` and skips rows whose backoff window is still open.

## Freshness

Every source still passes through Phase 5A admission (`staleSkipped`
before persistence). A trusted `publishedAt` older than 30 days is
dropped before company creation / job persistence. Phase 5E does not
change this.

## Snapshot safety

`snapshotComplete=false` on any adapter output disables lifecycle miss
counting — the same guarantee as before. Multi-source orchestration only
aggregates the engine's per-source outcome; a partial/failed source
contributes zero misses to `applyMissingLifecycle`.

## Admin CLIs

All three CLIs require `SUPABASE_SECRET_KEY` (server-only) and never
write to browser storage.

### `pnpm jobs:sources:verify`

READ-ONLY. Probes each source through the provider's public host.
Outcomes: `verified`, `empty`, `unreachable`, `rate_limited`, `invalid`,
`parse_failed`. Never mutates the database. Selectors:
`--provider=<name>`, `--source=<uuid-or-identifier>`, `--limit=<n>`.

### `pnpm jobs:sources:audit`

READ-ONLY. Registry health report: totals by provider, invalid configs,
duplicate identifiers, direct sources missing a canonical company, rows
under backoff, rows never synced. `--coverage` also prints a catalog
coverage report (fresh open jobs by provider / work mode / employment
type / freshness bucket / country, plus company + logo status
distributions and a heuristic role-family breakdown).

### `pnpm jobs:sync`

Dry-run by default. `--apply` is required to persist. Delegates every
source to `syncJobSource` — the Phase 3 engine already owns run
tracking, lifecycle, backoff, and the fast path. Selectors:
`--provider=<name>`, `--source=<uuid-or-identifier>`, `--limit=<n>`,
`--concurrency=<1-5>`.

## Concurrency & failure isolation

Default worker pool width: **3**. Maximum: **5** (documented cap; the
orchestrator clamps `--concurrency=<n>` into that range). One source
failure never aborts the run — the orchestrator catches per-source
errors, records them as `failed` outcomes, and continues to the next
source. `source_sync_runs` still records each run individually.

## Migration 0014

Additive, idempotent. Contents:

1. Narrowly-scoped legacy repair: rows where
   `logo_status='unresolved' AND domain IS NULL AND logo_storage_path IS NULL`
   are returned to `logo_status='pending'`. Those rows were flipped
   incorrectly by the pre-fix bulk assets CLI.

Deliberately **NOT** in 0014:

- New company / source seeds. Every candidate direct-employer source
  must be verified against its provider host before it enters the
  migration. This Claude environment had no outbound access to
  `boards-api.greenhouse.io`, `api.lever.co`, `api.eu.lever.co`, or
  `api.ashbyhq.com`, so no seeds were fabricated. The candidate list
  document at [`JOB_SOURCE_REGISTRY_CANDIDATES.md`](./JOB_SOURCE_REGISTRY_CANDIDATES.md)
  is intentionally empty.
- Schema changes. `job_sources` already has every field the
  orchestrator needs.

## Live rollout procedure

Do **not** apply 0014 or any candidate seeds automatically. The
approved sequence is:

1. Review + apply [`0014_source_registry_expansion.sql`](../supabase/migrations/0014_source_registry_expansion.sql).
2. `pnpm jobs:sources:audit`  — confirm registry health after the repair.
3. `pnpm jobs:sources:verify --limit=10`  — small batch across providers.
4. `pnpm jobs:sync --provider=greenhouse --limit=5 --apply`  — small
   verified batch.
5. Immediately re-run the same command — prove idempotency (`created≈0`,
   `unchanged` dominates).
6. `pnpm jobs:sources:audit --coverage`  — inspect fresh job count.
7. Expand the remaining verified sources with `--concurrency=3 --apply`.
8. `pnpm jobs:cleanup --apply`  — reuse the existing lifecycle CLI.
9. `pnpm companies:assets --apply`  — only trusted-domain companies are
   selected by default now.

## Live rollout results (2026-09-15, 0014 applied)

Registry after 0014:

- **30 enabled sources** — Greenhouse 10, Lever 10, Ashby 9, WWR 1.
- 15 new direct sources seeded successfully; every `company_id` binding
  valid; every new company row starts `domain = NULL` / `logo_status =
  'pending'`.
- Legacy `unresolved + domain-null + storage-null → pending` repair
  succeeded: `bad_domainless_unresolved = 0` after the run.

Bulk orchestration snapshot after expansion:

```
sources_total=30 attempted=26 succeeded=26 failed=0
skipped_backoff=3 skipped_invalid=0
jobs_fetched=975 accepted=842 staleSkipped=132 created=794 updated=48 unchanged=0
```

Pilots (all `snapshotComplete = true`):

- **Remote / Greenhouse** — fetched 206, accepted 206, created 181, updated 25.
- **HighLevel / Lever** — fetched 88, accepted 87, created 87, rejected 1.
- **Ema / Ashby** — fetched 44, accepted 11, staleSkipped 33, created 11
  (staleSkipped came from historical postings older than 30 days — the
  Phase 5A freshness admission worked as intended).

The three `skipped_backoff` rows are exactly the three pilots — expected;
do NOT bypass backoff for testing. Post-backoff idempotency reruns are
listed under **Pending live idempotency verification** below.

## WWR registry compatibility (Phase 5E carryover fix)

The initial Phase 5E validator introduced a **second** WWR string
(`'weworkremotely-all-jobs-rss'`) that did not match the canonical
`WWR_SOURCE_IDENTIFIER = 'weworkremotely-all'` used by the adapter and
migration 0009. That made the audit report the existing WWR row as
`invalid` and the bulk orchestrator classify it as `skipped_invalid`.

Fix: the registry now `import`s and re-exports `WWR_SOURCE_IDENTIFIER`
from `@/lib/jobs/adapters/wwr-http` as the **single** source of truth.
The validator, the candidate CLI, and the adapter now share exactly one
constant. Regression coverage in
[`tests/unit/jobs/sources-wwr-registry.test.ts`](../tests/unit/jobs/sources-wwr-registry.test.ts).
No migration was needed — production data was already correct.

Every Phase 4D invariant is preserved: one global WWR source,
`company_id IS NULL` at the source level, `snapshotComplete = false`,
missing RSS entries never close jobs, employer resolved per posting.

## Full-catalog coverage semantics (Phase 5E carryover fix)

Supabase / PostgREST caps a single response at ~1000 rows regardless of
`.limit()`. The initial coverage report leaned on one unbounded SELECT
and consequently reported `1000` on a larger catalog. `buildCoverageReport`
now:

1. Issues a `head + count: 'exact'` request to learn the true total.
2. Pages the fresh catalog in 1000-row `.range()` slices ordered by
   `(freshness_at DESC, id DESC)` and continues until a short page
   returns (or we cover the reported total).
3. Fetches `job_source_postings` attribution in the same 1000-id slices.
4. Fetches company domain / logo status in 1000-id slices.
5. Never reads `description_html` / `description_text` — coverage uses
   card-level columns only.

The report also previously left `Providers:` blank because the `SELECT`
list omitted `id`, so the attribution join step had no keys. Fixed by
adding `id` to the coverage projection.

### Provider count semantics

`byProvider` reports **fresh canonical jobs by preferred attribution
provider**. Each canonical job is counted exactly once under its winning
provider, using the same direct-employer-over-aggregator precedence as
the product's `pickAttributionLabel`
(`greenhouse` < `lever` < `ashby` < `we_work_remotely`).

A canonical job with both direct-ATS **and** WWR evidence counts once
under the direct ATS — the aggregator only wins when it is the sole
evidence. A canonical job with no posting evidence is classified as
`unattributed` (never dropped). Every canonical job appears in exactly
one bucket, so `sum(byProvider) == freshOpenJobs`.

Regression coverage: 1000-boundary, 1001, 1505, 2500, zero-rows,
attribution-across-pages, and preferred-provider precedence tests in
[`tests/unit/jobs/sources-coverage.test.ts`](../tests/unit/jobs/sources-coverage.test.ts).

## Pending live idempotency verification

Run these AFTER normal backoff expires (do not force the CLI past
`next_sync_at`). Expected: `created ≈ 0`, `unchanged` dominates for each
source. Any `updated > 0` should correspond to a legitimate provider
change.

```bash
pnpm jobs:sync --provider=greenhouse --source=remotecom  --apply
pnpm jobs:sync --provider=lever      --source=gohighlevel --apply
pnpm jobs:sync --provider=ashby      --source=ema         --apply
```

Once these three post-backoff reruns are recorded, Phase 5E moves from
"applied + pilot" to **complete**.

## Company assets (last trusted-domain run)

- **Mem0** — `failed`: homepage response exceeded 400 000 bytes. Do
  NOT weaken the SSRF safety cap for a single site. Skip Mem0 in bulk
  runs and log the incompatibility.
- **Netomi** — `ready` (2 956 B).
- **TRM Labs** — `ready` (7 788 B).

## Catalog data-quality follow-ups (recorded, not scoped for 5E)

- Country column carries mixed representations (`IN` / `India`,
  `US` / `United States`, other provider variants). Normalization is
  future work.
- A few WWR-ingested company names still contain lightly-mis-decoded
  ampersands (`E. Breuninger& Co.`, `E. Breuninger&amp; Co.`). No
  broad normalization migration in this closeout.

## Known limitations

- No cron. Automated scheduling remains Phase 10.
- No new adapter families (Workday, SmartRecruiters, …) in 5E.
- Sync-triggered Next.js cache invalidation stays on the short
  `jobsFresh` TTL fallback — protected server-side revalidation is
  Phase 10.
- Structured job-skill search still deferred (adapters do not populate
  `job_skills`).
- Free-text country / company-name normalization is a data-quality
  follow-up (see above).
