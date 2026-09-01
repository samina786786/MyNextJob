# Job source registry — candidates

Every direct-employer source must clear our verifier before it enters
`0014_source_registry_expansion.sql`. The list below is discovered from
external research and is **VERIFIED_BY_MYNEXTJOB_CLI** on 2026-09-01
via the candidate mode of
[`pnpm jobs:sources:verify`](../src/lib/jobs/dev/cli-sources-verify.ts).

See [`JOB_SOURCE_REGISTRY.md`](./JOB_SOURCE_REGISTRY.md) for the workflow.

## How to verify a candidate (no DB access required)

```bash
pnpm jobs:sources:verify --candidate --provider=greenhouse --identifier=twilio
pnpm jobs:sources:verify --candidate --provider=lever      --identifier=gohighlevel
pnpm jobs:sources:verify --candidate --provider=ashby      --identifier=ema
```

Candidate mode never touches Supabase. It validates the identifier
grammar, constructs the adapter with its fixed provider host, fetches
the public endpoint, parses the response, and prints one of:
`verified`, `empty`, `unreachable`, `rate_limited`, `invalid`,
`parse_failed`.

Only `verified` or `empty` are seed-eligible. Anything else stays here.

## Verified candidates (seed-eligible)

Domain column is intentionally empty — no domain was authoritatively
established through our verifier and we do not guess.

### Lever

| Company | Identifier | Trusted domain | Outcome | Notes |
| --- | --- | --- | --- | --- |
| HighLevel | `gohighlevel` | _(none)_ | `verified jobCount≥1` | Verify probe uses `limit=1`. |
| AHEAD | `thinkahead` | _(none)_ | `verified jobCount≥1` | |
| Everbridge | `everbridge` | _(none)_ | `verified jobCount≥1` | |
| Smart Working Solutions | `smart-working-solutions` | _(none)_ | `verified jobCount≥1` | |
| Cprime | `cprime` | _(none)_ | `verified jobCount≥1` | |

### Greenhouse

| Company | Identifier | Trusted domain | Outcome | Notes |
| --- | --- | --- | --- | --- |
| Remote | `remotecom` | _(none)_ | `verified jobCount=206` | Large board — bounded by adapter caps at sync time. |
| Twilio | `twilio` | _(none)_ | `verified jobCount=135` | |
| StarTree | `startree` | _(none)_ | `verified jobCount=4` | |
| TechGrove by Banyan Software | `techgrovebybanyansoftware` | _(none)_ | `verified jobCount=8` | |
| Pratham International | `prathaminternational` | _(none)_ | `verified jobCount=4` | |

### Ashby

| Company | Identifier | Trusted domain | Outcome | Notes |
| --- | --- | --- | --- | --- |
| Ema | `ema` | _(none)_ | `verified jobCount=44` | |
| Emergence | `emergence` | _(none)_ | `verified jobCount=17` | |
| PlayPower Labs | `playpowerlabs` | _(none)_ | `verified jobCount=4` | |
| Deeptune | `deeptune` | _(none)_ | `verified jobCount=1` | |
| Careway | `careway` | _(none)_ | `verified jobCount=3` | |

## Rejected / deferred candidates

_(none)_ — every candidate above verified. No `unreachable`,
`rate_limited`, `invalid`, or `parse_failed` outcomes in this batch.

## Duplicate audit vs. existing registry

Existing direct-employer identifiers (from 0006, 0007, 0008):

- Greenhouse: `dscout`, `alphasense`, `turing`, `pay2dc`, `karat`
- Lever: `drivetrain`, `netomi`, `jumpcloud`, `h1`, `3pillarglobal`
- Ashby: `granica`, `junipersquare`, `mem0`, `trm-labs`

None of the 15 verified candidates collide with these. All company names
are also disjoint. Every candidate is classified **SAFE_NEW**; none are
AMBIGUOUS.

## Verification log

- **2026-09-01** — all 15 candidates above verified successfully via
  `pnpm jobs:sources:verify --candidate --provider=<p> --identifier=<id>`
  running against `boards-api.greenhouse.io`, `api.lever.co`, and
  `api.ashbyhq.com`. Seed rows added to
  `0014_source_registry_expansion.sql` behind idempotent `WHERE NOT
  EXISTS` guards.
