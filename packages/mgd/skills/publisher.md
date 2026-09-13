# Assigning a dataset publisher

Read this when setting or changing a dataset's publishing **organisation**.
Follow the ground rules in `SKILL.md` (especially rule 5 — confirm before
mutating — and the `set` vs `patch` rule).

CLI-created datasets omit `dataset-publisher`, so the web UI shows no publishing
organisation. There is **no `--publisher` flag and no `dataset publisher set`
command** — by design. Assign a publisher by composing the existing aspect/API
primitives through the workflow below. `dataset-publisher.publisher` is an
organisation **record id**, never a free-text name.

## 1. Resolve the organisation before writing anything

Treat the name the user gave you as a lookup key, not a value to store. Search
existing records carrying the `organization-details` aspect (there is no curated
`search organisations` command — use the raw registry API):

```sh
# exact case-insensitive match on the organisation's canonical title.
# ":?" without % wildcards is a case-insensitive exact match (ILIKE, no pattern).
mgd api request GET /v0/registry/records \
  --query aspect=organization-details \
  --query 'aspectQuery=organization-details.title:?Bureau of Meteorology' \
  --query optionalAspect=organization-details --json \
  | jq -r '.records[] | [.id, .aspects["organization-details"].title] | @tsv'
```

For a broader **contains/substring** search, use the case-insensitive regex
operator `:~` (not ILIKE `%…%`, which the registry rejects with a 500):

```sh
mgd api request GET /v0/registry/records \
  --query aspect=organization-details \
  --query 'aspectQuery=organization-details.title:~Bureau of Meteorology' \
  --query optionalAspect=organization-details --json \
  | jq -r '.records[] | [.id, .aspects["organization-details"].title] | @tsv'
```

- Prefer an **exact case-insensitive** match on `organization-details.title` (or
  `name`). Use that record's **id** as the publisher value.
- If several plausible matches come back, **show them and ask the user** which
  record to use — never guess.
- If nothing matches, do **not** create an organisation automatically. A failed
  lookup never means "create".

If the user supplies an organisation **record id** directly, verify it exists and
has an `organization-details` aspect (`mgd dataset aspect get <orgId>
organization-details`), and read its canonical title for the DCAT mirror.

## 2. Creating a new organisation is an explicit, confirmed mutation

Only when the user wants a publisher that doesn't exist: tell them this creates a
new **global** `organisation` record (not dataset-scoped), show the proposed name
and the exact record to be written, get explicit go-ahead (ground rule 5), then
create it via the raw API — note `POST` needs **`--body-file`**, not `--body @file`:

```sh
cat > /tmp/org.json <<'JSON'
{ "name": "bom", "aspects": { "organization-details": { "title": "Bureau of Meteorology", "name": "bom" } } }
JSON
mgd api request POST /v0/registry/records --body-file /tmp/org.json --json   # -> .id
```

Use the returned id as the publisher value.

## 3. Write the reference with `aspect set`

`dataset-publisher` is a small, complete reference aspect, so replacing it
wholesale is correct:

```sh
mgd dataset aspect set <datasetId> dataset-publisher '{"publisher":"<organisationId>"}' --json
```

## 4. Keep the DCAT display mirror in sync with `aspect patch`

Some deployments also show `dcat-dataset-strings.publisher` (a mirrored *name*).
Update only that field — **never `aspect set` here**, or you'll drop
title/description/keywords/license/dates:

```sh
mgd dataset aspect patch <datasetId> dcat-dataset-strings '{"publisher":"<canonical organisation title>"}' --json
```

Derive the mirror name from the resolved organisation record, not from a
separately typed string.

**At create time** you may fold both into the initial record once the org is
resolved and confirmed — but don't replace the standard DCAT aspect with a
partial object; if composing it safely is awkward, create first and then run
steps 3–4:

```sh
mgd dataset create --title "…" \
  --aspect 'dataset-publisher={"publisher":"<organisationId>"}' --json
```

## Don't backfill

Publisher assignment happens only when the user asks for it or as part of a
confirmed create/enrich plan. Changing `--title`, `--desc`, `--license` or any
unrelated field must **never** silently assign or default a publisher, and a
missing `dataset-publisher` must not auto-become a site default.

## Versioning

Steps 3–4 use raw `aspect set`/`patch`, which (per ground rule 7 and #3687)
deliberately do **not** bump the application-managed `version` aspect. Registry
event history still records the mutations. Don't hand-edit `version` to
compensate — a raw-aspect publisher change is intentionally not a new semantic
version.
