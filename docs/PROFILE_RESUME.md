# Profile, resume, and onboarding

Phase 2 turns a confirmed MyNextJob account into a usable candidate
profile. Extraction is a **suggestion system**, not an authority. The
user reviews, edits, adds, and removes everything that matters.

```text
Account → Upload resume → Parse → Review profile → Job preferences → /home
```

`profiles.onboarding_completed` is the source of truth. Progress is
derived from server data (default resume parse status + saved headline),
not localStorage. Interrupted onboarding resumes at the first unfinished
step.

## Routes

| Path | Who |
| --- | --- |
| `/onboarding/resume` | Upload / retry parse |
| `/onboarding/profile` | Review extracted profile + skills |
| `/onboarding/preferences` | Target roles, work style, locations |
| `/profile` | Completed profile, resume, preferences |
| `/home` | Greeting after onboarding |

Anonymous visitors are sent to sign-in. Users with
`onboarding_completed = false` are guided into the right onboarding
step and cannot loop between `/home` and onboarding.

Replace-resume uses `/onboarding/resume?replace=1` then profile review.
Parser output is suggested again; **manual profile fields are not
overwritten**. After the user confirms skills, a later re-parse updates
`parsed_content` only and does not recreate `resume_skills` rows.

## Storage

- Private bucket: `resumes`
- Object key: `{auth_user_id}/{resume_id}.pdf|docx`
- `upsert: false`
- Original filename is DB metadata only
- No public URLs. Download uses a 60-second signed URL that is not stored.
- Browser uploads directly with the authenticated client; the App Router
  never proxies the binary on the happy path
- If Storage succeeds and the DB insert fails, the object is deleted

## Validation

Client checks existence, 10 MB cap, `.pdf`/`.docx`, and allowed MIME.
Server also inspects magic bytes: `%PDF` for PDF, ZIP +
`[Content_Types].xml` + `word/` for DOCX. Spoofed content is rejected.

## Parsing

Runs **only on the Node server** (`unpdf` for PDF, `mammoth.extractRawText`
for DOCX). Packages are listed in `serverExternalPackages` and imported
behind `server-only` so they never enter the client bundle.

No OCR. No third-party resume API. No embeddings. Bytes are never sent
to unrelated services.

Statuses match the existing enum: `pending`, `processing`, `succeeded`,
`failed`. The UI says “complete” when status is `succeeded`. Failed
parses keep the file so the user can **Try reading again**. Concurrent
parse requests for the same resume return `busy`.

Logs (`resume_parse_started|completed|failed`) include resume id, user
id, duration, and parser type — never resume text.

## What we infer

Deterministic only, and conservative:

- Headline / current role from early lines that look like job titles
- Years of experience only from phrases like “8 years of experience”
- Skills by boundary-aware alias match against `public.skills`
- Location is **not** guessed

We do **not** store phone, street address, date of birth, government id,
photos, or other sensitive fields as structured data. We do **not**
overwrite `profiles.full_name` from a guessed resume name.

## Skills

`0004_profile_resume_onboarding.sql` seeds ~75 canonical software skills
with aliases (`React.js` → React, `NodeJS` → Node.js, `Amazon Web
Services` → AWS). Matching is case-insensitive and will not treat
`Java` as a hit inside `JavaScript`. Authenticated users can read the
taxonomy; they cannot mutate it.

## Preferences

Optional-by-field, with caps: 10 target roles, 10 locations, 20 excluded
keywords, match score default 75. Work modes: remote / hybrid / on-site.
Employment: full-time, contract, freelance, internship. Salary is
optional. Matching itself is not implemented in this phase.

## Privacy rules

- Private Storage only
- Owner RLS on profiles, resumes, resume_skills, job_preferences
- Parse only objects owned by the authenticated user
- Never fetch a resume from a user-supplied URL
- Never log file contents
