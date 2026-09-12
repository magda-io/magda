# Using the `mgd` CLI for MAGDA workflows

Instructions for assistant tools (and humans) driving a MAGDA data catalog
through the `mgd` command-line interface. Tool-agnostic: adapt the framing to
your assistant environment, keep the rules.

## Ground rules

1. **Check auth first.** Before any MAGDA access, run `mgd auth status --json`.
   If it fails with exit code 2, no usable profile is configured — relay the
   error message, which says whether to run `mgd profile create <name>` (none
   set up) or `mgd profile use <name>` (one exists but isn't active). If
   `authenticated` is `false`, read-only public commands may still work, but
   mutations will fail — say so up front.
2. **Prefer curated commands** (`search`, `dataset`, `dist`, `file`, `aspect`)
   over `mgd api request`. Use the raw command only when no curated command
   covers the endpoint, and mention that you did.
3. **Always parse machine output.** Use `--json` (single document) or `--jsonl`
   (one JSON object per line) on every command whose output you consume.
   Never scrape human-mode output. Read and list commands emit their data as
   JSON; the aspect/record mutations (`aspect create`, `dataset aspect set`/
   `patch`/`delete`, `dataset`/`dist update`) print a compact `{…, "ok": true}` result in
   `--json` mode; and `aspect get` / `dataset aspect get` emit JSON already (the
   flag is optional there). Downloads write the file itself, so they take no
   `--json`.
4. **Respect exit codes.** `0` ok; `2` usage error (your command line is wrong);
   `3` auth error (key missing/invalid or no permission); `4` not found;
   `1` anything else. In `--json` mode a failing command prints
   `{"error": {"code", "message", "status", "hint"}}` on stderr.
5. **Confirm before mutating or publishing.** Never run `dataset create --publish`, `add-file`, `replace-file`, `update`, `aspect create/set/patch/delete`,
   or any `api request` with POST/PUT/PATCH/DELETE without the user's explicit
   go-ahead in this conversation. Uploading or attaching generated artifacts
   happens only when the user asked for it. For *how* to create and publish once
   the user has agreed, see "Creating, editing & publishing datasets" below.
6. **Report identifiers.** Every user-facing summary must include the dataset
   IDs, distribution IDs, local file paths, and upload targets you touched.
7. **Versioning is automatic.** The CLI maintains the `version` aspect on
   high-level commands (`create`/`update`/`add-file`/`replace-file`/`remove`)
   and tags versions with registry event ids. `publish`/`unpublish` never bump
   versions. Never hand-edit the `version` aspect; raw `aspect set`/`patch`/
   `delete` never auto-bump.

## Keyword vs semantic search — use both

`mgd search datasets <query>` — keyword/faceted search over the index.
Strengths: exact terms, org vocabulary, filters, pagination, fast. Weakness:
misses conceptual matches phrased differently from the metadata.

`mgd search semantic <query>` — embedding similarity over indexed content.
Strengths: natural-language and conceptual queries ("rainfall trends near
brisbane"), matching document content rather than titles. Weakness: not
available on every site — it fails with code `semantic-search-unavailable`;
fall back to keyword-only silently.

Recipe — combined search:

```sh
mgd search datasets "water quality" --limit 20 --jsonl > kw.jsonl
mgd search semantic "water quality" --limit 20 --jsonl > sem.jsonl || true
# merge: keep keyword rank first, append semantic-only recordIds
jq -r '.identifier' kw.jsonl > ids.txt
jq -r '.recordId' sem.jsonl | grep -v -x -F -f ids.txt >> ids.txt
```

Then inspect the top candidates with `mgd dataset get <id> --json`. This returns
the complete record with **all** aspects attached to it, including any custom
aspects (`.aspects["<aspectId>"]`); use `--aspect <aspectId>` to fetch just one.

## Common recipes

Search → inspect → download → analyse locally:

```sh
mgd search datasets "air quality" --limit 10 --jsonl | jq -r '.identifier'
mgd dataset get ds-abc --json | jq '.aspects["dcat-dataset-strings"]'
mgd dataset distributions ds-abc --jsonl | jq -r '[.id, .aspects["dcat-distribution-strings"].format] | @tsv'
mgd dist download dist-xyz -o ./data/raw.csv
# analyse ./data/raw.csv locally with your usual tools
```

Download many distributions:

```sh
mgd dataset distributions ds-abc --jsonl \
  | jq -r '.id' \
  | xargs -I{} mgd dist download {} -o ./data/{}.bin
```

Large files: downloads resume with `--resume`; uploads switch to multipart
automatically at 16 MB — no flags needed.

Upload an artifact the user asked to publish (see dataset-elicitation.md for
the metadata conversation first):

```sh
mgd dataset add-file ds-abc ./analysis/summary.parquet --title "2026 summary" --json
```

Remove a distribution (unlinks it, bumps the dataset version, deletes the
record and its stored files; `--keep-files` keeps the objects):

```sh
mgd dist remove dist-xyz --json
```

Custom / domain metadata — when the standard aspects don't fit your data,
define your own JSON-schema-validated aspect (the CLI exposes this; the web UI
doesn't):

```sh
mgd aspect list --jsonl                     # what aspect types exist here?
mgd aspect create my-domain --name "My Domain" --schema @schema.json --json
mgd aspect delete my-domain                 # remove a definition; refused (409) if records still use it
mgd dataset aspect set ds-abc my-domain @values.json --json   # replace the whole aspect
mgd dataset aspect patch ds-abc dcat-dataset-strings '{"keywords":["a","b"]}' --json  # merge one field, keep the rest
mgd dataset aspect get ds-abc my-domain     # already JSON; --json optional
```

**`set` replaces the whole aspect; `patch` merges.** To change one field (e.g.
add `keywords` to `dcat-dataset-strings`) use `patch` — it deep-merges your
partial object server-side and leaves the other fields intact. Reach for `set`
only when you intend to overwrite the entire aspect. For advanced RFC 6902 ops
(remove/test/move), use `mgd api request PATCH …/aspects/<id> --body @patch.json`.

Raw fallback (documented REST endpoints only):

```sh
mgd api request GET /v0/registry/records --query limit=3 --query aspect=dcat-dataset-strings
```

## Creating, editing & publishing datasets

Metadata first: when creating or editing dataset metadata, follow
`dataset-elicitation.md` (infer before asking, quick vs guided path,
confirm-then-write). This section covers the *command mechanics* once you know
what to write. Every mutation here is subject to ground rule 5 — get the user's
go-ahead first.

Canonical sequence — **create → enrich → add files → publish**:

```sh
# 1. Create a draft (draft is the default; --publish would create it published)
mgd dataset create --title "River gauge readings 2025" \
  --desc "Daily river height and flow measurements." --json   # -> magda-ds-<uuid>

# 2. Enrich metadata (patch merges these fields, keeping the rest — see set vs patch above)
mgd dataset aspect patch magda-ds-<uuid> dcat-dataset-strings \
  '{"keywords":["river","hydrology"],"themes":["water"]}' --json

# 3. Add a file (--format overrides the extension-detected format)
mgd dataset add-file magda-ds-<uuid> ./readings.csv --title "2025 readings" --format csv --json

# 4. Publish — cascades to all the dataset's distributions
mgd dataset publish magda-ds-<uuid> --json
```

**Publishing commands:**

- `mgd dataset create --publish` — create published instead of the default draft.
- `mgd dataset publish <id>` / `mgd dataset unpublish <id>` — set the dataset's
  `publishing.state` and **cascade to every distribution**. Add
  `--without-distributions` to change only the dataset record.
- `mgd dist publish <distId>` / `mgd dist unpublish <distId>` — flip a single
  distribution.
- Publishing never bumps the `version` aspect (lifecycle state, not content).

**Distributions are records too.** `mgd dataset get` lists only distribution IDs;
use `mgd dataset distributions <id> --jsonl` for full distribution metadata, and
`mgd dataset aspect get/set/patch <distId> …` to read or edit a distribution's
aspects directly.

**Downloading.** A distribution's `downloadURL` is an internal address
(`magda://storage-api/...`), not a fetchable URL. Always download with
`mgd dist download <distId> -o <path>` — never fetch the raw `downloadURL`.

### Common aspects

| Aspect | Record | Holds / notes |
| --- | --- | --- |
| `dcat-dataset-strings` | dataset | `title`, `description`, `keywords`, `themes`, `languages`, `issued`/`modified` |
| `dcat-distribution-strings` | distribution | per-file `title`, `format`, `downloadURL`, `accessURL`, `byteSize` |
| `publishing` | dataset & distribution | `{ "state": "draft" \| "published" }` — use publish/unpublish, don't hand-edit |
| `dataset-distributions` | dataset | `{ "distributions": [<distId>, …] }` — CLI-managed by `add-file`/`dist remove`; don't hand-edit |
| `version` | dataset & distribution | CLI-managed history — never hand-edit (ground rule 7) |
| `access-control` | dataset | `ownerId`, `orgUnitId`, `constraintExemption` |
| `source` | dataset | provenance (`id: "magda"`, `name: "Magda CLI (mgd)"`, `type`, `url`) |
| `dataset-publisher` | dataset | `{ "publisher": "<organisation record id>" }` — the web UI shows this org before the dates. The value is an organisation **record id**, not a name — see "Assigning a publisher" below |
| `dataset-format` | distribution | `{ "format": "<str>", "confidenceLevel": <0–100> }` — the **effective** format. Written by `magda-minion-format`; **takes precedence over** `dcat-distribution-strings.format` for previews and search (see "Cataloguing remote/link distributions" below) |
| `visualization-info` | distribution | `{ "timeseries": <bool>, "fields": { "<CsvHeader>": { "time": <bool>, "numeric": <bool> } } }` — controls a CSV chart's default axes/series |
| `preview-tabular-data-settings` | distribution | *optional* — `{ "enableChart": <bool>, "enableTable": <bool> }` to force chart/table previews on or off |
| `temporal-coverage` | dataset | *optional* — `{ "intervals": [{ "start", "end" }] }`; set manually when the data spans a time range |
| `spatial-coverage` | dataset | *optional* — bounding box / named region; set manually when the data has a spatial extent |

**Need a field these don't cover?** Define a custom, JSON-schema-validated
aspect — `mgd aspect create <id> --name "…" --schema @schema.json`, then attach
data with `dataset aspect set`/`patch` (see "Custom / domain metadata" above).

### Assigning a publisher

CLI-created datasets omit `dataset-publisher`, so the web UI shows no publishing
organisation. There is **no `--publisher` flag and no `dataset publisher set`
command** — by design. Assign a publisher by composing the existing aspect/API
primitives through the workflow below. `dataset-publisher.publisher` is an
organisation **record id**, never a free-text name.

**1. Resolve the organisation before writing anything.** Treat the name the user
gave you as a lookup key, not a value to store. Search existing records carrying
the `organization-details` aspect (there is no curated `search organisations`
command — use the raw registry API):

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

**2. Creating a new organisation is an explicit, confirmed mutation.** Only when
the user wants a publisher that doesn't exist: tell them this creates a new
**global** `organisation` record (not dataset-scoped), show the proposed name and
the exact record to be written, get explicit go-ahead (ground rule 5), then
create it via the raw API — note `POST` needs **`--body-file`**, not `--body @file`:

```sh
cat > /tmp/org.json <<'JSON'
{ "name": "bom", "aspects": { "organization-details": { "title": "Bureau of Meteorology", "name": "bom" } } }
JSON
mgd api request POST /v0/registry/records --body-file /tmp/org.json --json   # -> .id
```

Use the returned id as the publisher value.

**3. Write the reference with `aspect set`** — `dataset-publisher` is a small,
complete reference aspect, so replacing it wholesale is correct:

```sh
mgd dataset aspect set <datasetId> dataset-publisher '{"publisher":"<organisationId>"}' --json
```

**4. Keep the DCAT display mirror in sync with `aspect patch`.** Some deployments
also show `dcat-dataset-strings.publisher` (a mirrored *name*). Update only that
field — **never `aspect set` here**, or you'll drop title/description/keywords/
license/dates:

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

**Don't backfill.** Publisher assignment happens only when the user asks for it
or as part of a confirmed create/enrich plan. Changing `--title`, `--desc`,
`--license` or any unrelated field must **never** silently assign or default a
publisher, and a missing `dataset-publisher` must not auto-become a site default.

**Versioning.** Steps 3–4 use raw `aspect set`/`patch`, which (per ground rule 7
and #3687) deliberately do **not** bump the application-managed `version` aspect.
Registry event history still records the mutations. Don't hand-edit `version` to
compensate — a raw-aspect publisher change is intentionally not a new semantic
version.

## Cataloguing remote/link distributions & making previews work

This section is about **remote/link distributions** — datasets whose data lives
at an external URL (ArcGIS/WMS/WFS endpoints, remote CSV/JSON/API) rather than an
uploaded file. Getting such a distribution to **preview** (map / table+chart /
JSON records) in the web UI is dominated by one non-obvious fact:

> **The `dataset-format` aspect — not `dcat-distribution-strings.format` —
> governs both preview selection and the search index.** The web client reads the
> effective format from `dataset-format` first and only falls back to the DCAT
> `format`. `add-file --format` sets the **DCAT** format; when `magda-minion-format`
> is enabled it writes a `dataset-format` aspect that **overrides** it. So
> `--format csv` alone may be silently overridden and no table preview appears.

**To force the effective format, set the aspect** (confidence `100` beats the
minion's guess):

```sh
mgd dataset aspect set <distId> dataset-format '{"format":"csv","confidenceLevel":100}' --json
```

### Ordering & the minion re-clobber trap

`magda-minion-format` re-runs whenever `dcat-distribution-strings` changes and
re-derives `dataset-format` from URL/content sniffing — sometimes **wrongly**
(a `…DataDrillDataset.php?…&format=csv` endpoint got tagged `X-HTTPD-PHP` from the
server MIME; an ArcGIS `…/FeatureServer/0/query?f=geojson` endpoint got tagged
`ESRI FEATURESERVER` because the URL contains "FeatureServer", clobbering an
explicit `GEOJSON` — see magda-io/magda-minion-format#25).

So: **set `dataset-format` last**, after every `dcat-distribution-strings` edit.
Any later DCAT patch re-triggers the minion and can clobber it again. Confirm the
effective format stuck by **polling the search API** (see "Verifying", below), not
the registry.

### Format → preview matrix

The effective (`dataset-format`) value drives which preview renders:

| Preview | Effective format that triggers it | Notes |
| --- | --- | --- |
| **Table + chart** | matches `csv` as a whole word (`/(^\|\W+)csv(\W+\|$)/i`) | also needs a fetchable URL (see "remote direct files") and passes the proxy allow-list |
| **Map** | one of (in preference order) `WMS`, `ESRI MAPSERVER`, `WFS`, `ESRI FEATURESERVER`, `GeoJSON`, `csv-geo-au`, `KML`, `KMZ` | first match in that order wins |
| **JSON records** | JSON served at a fetchable URL | rendered by the JSON tree viewer on the distribution page |

**Map specifics:**

- **WMS with a working `GetCapabilities` is the most reliable map path.**
- **ArcGIS FeatureServer** must point at a *specific layer* (`…/FeatureServer/0`,
  not the service root) — and even then the current preview-map can fail to
  render it (magda-io/magda-preview-map#26). The reliable workaround is to add a
  **second GeoJSON distribution** pointing at the layer's query endpoint and
  classify it `GeoJSON`:

  ```sh
  mgd dataset add-file <datasetId> \
    --access-url 'https://…/FeatureServer/0/query?where=1=1&outFields=*&f=geojson' \
    --title "… (GeoJSON)" --json
  mgd dataset aspect set <newDistId> dataset-format '{"format":"GeoJSON","confidenceLevel":100}' --json
  ```

### "The preview says the file is there but nothing loads" (403 = proxy allow-list)

CSV/JSON/map previews fetch the remote URL **through the preview-map proxy**
(`/preview-map/proxy/`), which only proxies hosts whitelisted in
`magda-preview-map.serverConfig.allowProxyFor` (suffix match; defaults include
`gov.au`, `arcgis.com`, `csiro.au`). A source on a non-listed host (e.g.
`ala.org.au`, `gbif.org`) returns **403** and the preview stays empty. This is a
**deployment config** change (add the host to `allowProxyFor`), **not** a metadata
fix — tell the user that rather than fiddling with aspects.

### Remote direct-download files (downloadURL + license)

For a remote file the preview should fetch and render (e.g. a remote CSV), the
preview loader prefers **`downloadURL`**, but `add-file --access-url` only sets
`accessURL`; and `add-file` has **no `--license`**. The working recipe (note the
ordering — `dataset-format` last):

```sh
DIST=$(mgd dataset add-file <datasetId> --access-url 'https://host.gov.au/data.csv' --format csv --json | jq -r '.distributionId')
mgd dataset aspect patch "$DIST" dcat-distribution-strings '{"downloadURL":"https://host.gov.au/data.csv"}' --json
mgd dist update "$DIST" --license "CC-BY-4.0" --json
mgd dataset aspect set "$DIST" dataset-format '{"format":"csv","confidenceLevel":100}' --json  # set dataset-format last
```

### Default chart axes (`visualization-info`)

A CSV chart's default X/Y come from the `visualization-info` aspect. Without it
(and without the visualisation minion) the chart encoder guesses badly. Set
`timeseries` and per-field `{ "time" | "numeric" }` flags, with keys **matching
the CSV headers exactly**:

```sh
mgd dataset aspect set <distId> visualization-info \
  '{"timeseries":true,"fields":{"Date":{"time":true},"Rainfall_mm":{"numeric":true}}}' --json
```

`preview-tabular-data-settings` (`{"enableChart":bool,"enableTable":bool}`) force
the chart/table previews on or off independently.

### Resolving the id of a just-added distribution

`mgd dataset add-file --json` returns the new id in the **`distributionId`**
field (and in plain mode it prints the id to stdout), so capture it directly:

```sh
DIST=$(mgd dataset add-file <datasetId> --access-url 'https://host.gov.au/data.csv' --format csv --json | jq -r '.distributionId')
```

Fallback only if you've lost it — re-list and match on the URL you added:

```sh
mgd dataset distributions <datasetId> --jsonl \
  | jq -r 'select(.aspects["dcat-distribution-strings"].accessURL=="https://host.gov.au/data.csv") | .id'
```

### Verifying changes

- **State** lives in the `publishing` aspect — check it directly; search hitCount
  and admin-visible drafts don't prove published state.
- **Drafts aren't in the public search index** — only published datasets are. To
  confirm the effective format on a *draft*, read the registry aspect directly:

  ```sh
  mgd dist get <distId> --json | jq -r '.aspects["dataset-format"].format'
  ```

  Bear in mind `magda-minion-format` may still re-derive `dataset-format`
  asynchronously (the re-clobber trap above), so re-read after a moment if a DCAT
  edit could have re-triggered it.
- **Once published**, the **search index lags the registry** after any mutation —
  the delay ranges from seconds to a few minutes depending on the deployment's
  indexer schedule, so poll (don't assume one read is final) to confirm what
  previews actually read (they use the indexed effective value):

  ```sh
  mgd search datasets "<dataset title>" --jsonl | jq -r 'select(.identifier=="<datasetId>") | .distributions[].format'
  ```

## Error triage

- exit 3 + `unauthorized` → API key invalid/expired: ask the user to update the
  profile (`mgd profile update <name> --key-id … --key …`) or recreate it
  (`mgd profile create <name>`).
- exit 3 + `forbidden` → the key is valid but the account lacks permission for
  that operation. Common cause: the user assumed they could create/upload/publish
  but haven't been granted those rights. Report which operation was denied,
  explain it's a permissions grant (not a missing record or a bug), and advise
  them to ask their MAGDA system administrator to grant the relevant
  permission/role. Do not retry.
- exit 4 → record/object doesn't exist: re-check the ID (search again) before
  reporting data as missing.
- `semantic-search-unavailable` → use keyword search only.
- Network errors mention the base URL — verify `mgd auth status` and the site
  URL before concluding the service is down.
