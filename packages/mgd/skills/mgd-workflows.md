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
| `dataset-publisher` | dataset | `{ "publisher": "<organisation record id>" }` — the web UI shows this org before the dates. **The CLI does not set it** (see note below) |
| `temporal-coverage` | dataset | *optional* — `{ "intervals": [{ "start", "end" }] }`; set manually when the data spans a time range |
| `spatial-coverage` | dataset | *optional* — bounding box / named region; set manually when the data has a spatial extent |

**Need a field these don't cover?** Define a custom, JSON-schema-validated
aspect — `mgd aspect create <id> --name "…" --schema @schema.json`, then attach
data with `dataset aspect set`/`patch` (see "Custom / domain metadata" above).

**Publisher gap.** CLI-created datasets omit `dataset-publisher`, so the web UI
shows no publishing organisation. Populating it correctly needs an
`organisation` record ID (not a name), which the CLI doesn't yet resolve —
tracked in issue #3715. Interim workaround, only if you already know the org's
record ID: `mgd dataset aspect set <id> dataset-publisher '{"publisher":"<orgId>"}'`.

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
