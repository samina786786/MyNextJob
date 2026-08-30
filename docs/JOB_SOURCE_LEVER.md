# Lever Postings API source (Phase 4B)

Lever is an applicant-tracking system. Companies publish a public job
site. Lever exposes those published postings over HTTP with **no API key**.

MyNextJob discovers those jobs, maps them onto the Phase 3
`NormalizedJobInput` contract, and persists them through the existing
Job Engine + `SupabaseJobStore`. The adapter never writes SQL.

See also [`JOB_ENGINE.md`](./JOB_ENGINE.md) and
[`JOB_SOURCE_GREENHOUSE.md`](./JOB_SOURCE_GREENHOUSE.md).

## Public API

No Lever API key is required or accepted for discovery.

```text
GET https://api.lever.co/v0/postings/{SITE}?mode=json&skip={N}&limit={N}
GET https://api.eu.lever.co/v0/postings/{SITE}?mode=json&skip={N}&limit={N}
```

`SITE` is the public company namespace (example: `drivetrain` from
`https://jobs.lever.co/drivetrain`). It is stored on
`job_sources.external_identifier`.

Application POST (`?key=`) is out of scope. MyNextJob does not submit
Lever applications and does not store a Lever key.

Official contract: [lever/postings-api](https://github.com/lever/postings-api).

## Instances

`job_sources.metadata.lever_instance` is `global` or `eu` only.

| Instance | API | Careers |
| --- | --- | --- |
| `global` | `https://api.lever.co/v0/postings` | `https://jobs.lever.co/{site}` |
| `eu` | `https://api.eu.lever.co/v0/postings` | `https://jobs.eu.lever.co/{site}` |

The adapter never uses an arbitrary metadata URL as the request host.

## Pagination

The adapter owns `skip` / `limit`. Production page size is **100**.

A page of exactly `limit` jobs means another page is requested, including
an empty final page when the total is an exact multiple.

Safety caps (incomplete snapshot if hit first):

- max **20** pages
- max **2000** jobs per source

If the same posting `id` appears on two pages, the extra copy is dropped
and `snapshotComplete` is false.

## Snapshot semantics

`snapshotComplete = true` only when pagination ends naturally
(`page.length < limit`) and there was no duplicate-id anomaly or cap.

HTTP 404 is a source configuration error. It is **not** an empty complete
snapshot. Existing jobs stay open.

The full public site is fetched. Adapters do not filter by India, skills,
or the signed-in candidate.

## Mapping

| Lever | Normalized / canonical |
| --- | --- |
| `id` | `externalId` (string). Source-posting identity. |
| `text` | title as published |
| `categories.location` | `location.text` |
| `categories.allLocations` | raw payload; single entry may fill missing primary location |
| `country` | ISO 3166-1 alpha-2 → `location.country`; otherwise ignored |
| `workplaceType` | remote / hybrid / on-site → onsite / unspecified → unknown. Beats location inference. Location inference only if the field is missing. |
| `categories.commitment` | conservative employment type; unclear labels → unknown → NULL |
| `categories.team` / `department` | `team` / `department` on the normalized input |
| `description` + `lists` + `additional` | composed HTML → Phase 3 sanitizer. Do not re-append `opening` or `descriptionBody`. |
| `hostedUrl` | `sourceUrl` |
| `applyUrl` | `applyUrl` |
| `salaryRange` | salary only when min/max are finite and min ≤ max |
| publication time | always `publishedAt = null`. Official public fields do not include a first-published timestamp. |

`discovered_at` is when MyNextJob first persisted the job. Later UI should
say “Found …” not “Posted …” when publication time is missing.

## Company / source registry

Migration [`0007_lever_sources.sql`](../supabase/migrations/0007_lever_sources.sql)
seeds five live-verified QA sites. Review it before applying. It does
not create Lever-specific tables.

| Company | Site | Instance | Domain |
| --- | --- | --- | --- |
| Drivetrain | `drivetrain` | global | drivetrain.ai |
| Netomi | `netomi` | global | netomi.com |
| JumpCloud | `jumpcloud` | global | jumpcloud.com |
| H1 | `h1` | global | h1.com |
| 3Pillar | `3pillarglobal` | global | 3pillarglobal.com |

`source_type = lever`, `enabled = true`, `sync_frequency_minutes = 15`.
No cron is installed in this phase.

## Manual sync

```bash
pnpm jobs:lever --source=drivetrain --dry-run
pnpm jobs:lever --source=drivetrain
pnpm jobs:lever --all
pnpm jobs:lever --all --dry-run
```

Dry-run prints counts, instance, pages, and a short title/location
sample. It does not print descriptions or raw payloads.

Live run uses `SupabaseJobStore` and `syncJobSource`.

### Idempotency check

1. Dry-run `drivetrain`.
2. Live-sync `drivetrain` once.
3. Live-sync `drivetrain` again. Canonical job and posting counts must
   stay the same; `unchanged` should increase.

## Known limitations

- No official public `publishedAt`
- Commitment labels that are not clear stay NULL
- Salary is mapped only from structured `salaryRange`
- Board content is stored as composed + sanitized HTML
- No job skills, matching, feed UI, cron, or apply POST
- Signup confirmation `/error` and Custom SMTP are unrelated and deferred
