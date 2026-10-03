# Creating, editing & publishing datasets

Command mechanics for creating and maintaining dataset records. Follow the
ground rules in `SKILL.md` — especially **rule 5 (confirm before mutating)** and
the **`set` vs `patch`** rule there. For the metadata _conversation_ (what to
write, what to ask), follow `dataset-elicitation.md` first.

Related tasks have their own files: assigning a publisher → `publisher.md`;
making remote/link distributions preview → `preview.md`.

## Canonical sequence — create → enrich → add files → publish

```sh
# 1. Create a draft (draft is the default; --publish would create it published)
mgd dataset create --title "River gauge readings 2025" \
  --desc "Daily river height and flow measurements." --json   # -> magda-ds-<uuid>

# 2. Enrich metadata (patch merges these fields, keeping the rest — see set vs patch in SKILL.md)
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

## Attaching and removing files

Upload an artifact the user asked to publish (see `dataset-elicitation.md` for
the metadata conversation first):

```sh
mgd dataset add-file ds-abc ./analysis/summary.parquet --title "2026 summary" --json
```

Remove a distribution (unlinks it, bumps the dataset version, deletes the
record and its stored files; `--keep-files` keeps the objects):

```sh
mgd dist remove dist-xyz --json
```

## Common aspects

| Aspect                          | Record                 | Holds / notes                                                                                                                                                                                                             |
| ------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dcat-dataset-strings`          | dataset                | `title`, `description`, `keywords`, `themes`, `languages`, `issued`/`modified`                                                                                                                                            |
| `dcat-distribution-strings`     | distribution           | per-file `title`, `format`, `downloadURL`, `accessURL`, `byteSize`                                                                                                                                                        |
| `publishing`                    | dataset & distribution | `{ "state": "draft" \| "published" }` — use publish/unpublish, don't hand-edit                                                                                                                                            |
| `dataset-distributions`         | dataset                | `{ "distributions": [<distId>, …] }` — CLI-managed by `add-file`/`dist remove`; don't hand-edit                                                                                                                           |
| `version`                       | dataset & distribution | CLI-managed history — never hand-edit (ground rule 7)                                                                                                                                                                     |
| `access-control`                | dataset                | `ownerId`, `orgUnitId`, `constraintExemption`                                                                                                                                                                             |
| `source`                        | dataset                | provenance (`id: "magda"`, `name: "Magda CLI (mgd)"`, `type`, `url`)                                                                                                                                                      |
| `dataset-publisher`             | dataset                | `{ "publisher": "<organisation record id>" }` — the web UI shows this org before the dates. The value is an organisation **record id**, not a name — see `publisher.md`                                                   |
| `dataset-format`                | distribution           | `{ "format": "<str>", "confidenceLevel": <0–100> }` — the **effective** format. Written by `magda-minion-format`; **takes precedence over** `dcat-distribution-strings.format` for previews and search — see `preview.md` |
| `visualization-info`            | distribution           | `{ "timeseries": <bool>, "fields": { "<CsvHeader>": { "time": <bool>, "numeric": <bool> } } }` — controls a CSV chart's default axes/series (see `preview.md`)                                                            |
| `preview-tabular-data-settings` | distribution           | _optional_ — `{ "enableChart": <bool>, "enableTable": <bool> }` to force chart/table previews on or off                                                                                                                   |
| `temporal-coverage`             | dataset                | _optional_ — `{ "intervals": [{ "start", "end" }] }`; set manually when the data spans a time range                                                                                                                       |
| `spatial-coverage`              | dataset                | _optional_ — bounding box / named region; set manually when the data has a spatial extent                                                                                                                                 |
| `data-dictionary`               | distribution           | _optional_ — what fields/entities the distribution contains (see below)                                                                                                                                                   |
| `distribution-contract`         | distribution           | _optional_ — how the file/API can be accessed or queried (see below)                                                                                                                                                      |

## Data dictionary (`data-dictionary` on a distribution)

Describes a distribution's structure: `entities` (table/sheet/layer/API body), each with
`fields` (`path`, `name`, `type` required; optional `description`, `unit`, `semanticConcept`,
`required`/`nullable`, `valueDomain`, `roles`, …), plus optional `primaryKey`,
`relationships`, `dimensions` and `provenance`.

```sh
mgd dataset aspect get dist-xyz data-dictionary --json        # read before answering "what fields are there?"
mgd dataset aspect set dist-xyz data-dictionary @dict.json --json   # create/replace the whole dictionary
```

- Field `path` is a stable id: nested `a.b`, arrays `items[].x`; escape literal `\ . [ ]` in names with `\` (`"a\\.b"` in JSON for a column named `a.b`).
- Mark what you write: `"provenance": {"method": "agent-generated", "reviewStatus": "unreviewed"}` (or `"manual"` for values the user dictated).
  Every provenance object needs `method` and/or `reviewStatus`; `"method": "inferred"` also needs `"sample": {"rows": N}` (and/or `bytes`).
  Never overwrite values whose provenance is `manual` or `reviewed`/`custodian-approved` (check `propertyProvenance` per property too).
- Don't `aspect patch` anything inside `entities`/`fields`/`relationships`: arrays are combined, not merged by id, and duplicate entries result.
  Read the aspect, edit the JSON, then `aspect set` it back (or use a JSON Patch via `mgd api request PATCH …`).
- Only add `relationships`/`reference` roles the user or source metadata states explicitly — similar names are not evidence of a join.
- Don't invent fields: if the structure is unknown, use `"type": "unknown"` or leave the aspect absent.

Full reference: <https://github.com/magda-io/magda/blob/main/docs/docs/data-dictionary.md>

## Distribution contract (`distribution-contract` on a distribution)

Describes how to access/query a distribution: `protocol`, `endpointUrl`, `documentationUrl`,
`specification` (`type`, `url`, `version`, `fingerprint`), descriptive `authentication`, and curated
`operations` (`id` required; `label`, `purpose`, `interactionType`, `method`, `path`, `endpointUrl`,
`parameters` (`name`, `location`, `type` required), `request`/`response` with `dictionaryEntity`,
`recordsPath`, `pagination`), plus `sourceCapabilities`, `provenance` and `lastVerified`.

```sh
mgd dataset aspect get dist-xyz distribution-contract --json            # read before answering "how do I query this?"
mgd dataset aspect set dist-xyz distribution-contract @contract.json --json   # create/replace the whole contract
```

- **Never write credentials** (API keys, tokens, passwords, cookies) anywhere in it. Describe the mechanism only
  (`"authentication": {"type": "api-key", "location": "header", "name": "X-API-Key"}`); credential inputs and
  `Authorization` headers are never `parameters`.
- It is descriptive metadata, not permission to call the API: describing an operation (or `interactiveExampleCandidate`)
  doesn't mean you may execute it.
- Keep operation `id`s stable (prefer the source's id, e.g. OpenAPI `operationId`, in `sourceIdentifier`); parameters are
  identified by `sourceIdentifier`, else `location` + `name`. Don't invent ids for operations you can't name.
- Don't concatenate `endpointUrl` + `path` into a URL; set an operation `endpointUrl` only when you know the full URL.
- `recordsPath` and pagination `*Path` values are JSON Pointers (`/items`, not `$.items`); pagination `*Parameter`
  values name a `query` parameter of the same operation. Put body fields in `data-dictionary` and reference the entity id.
- Mark what you write (`"provenance": {"method": "agent-generated", "reviewStatus": "unreviewed"}`) and never overwrite
  values whose provenance is `manual` or `reviewed`/`custodian-approved` (check `propertyProvenance` too).
- Don't `aspect patch` anything inside `operations`/`parameters`: read, edit, `aspect set` (or JSON Patch via `mgd api request PATCH …`).

Full reference: <https://github.com/magda-io/magda/blob/main/docs/docs/distribution-contract.md>

## Custom / domain metadata

When the standard aspects don't fit your data, define your own JSON-schema-validated
aspect (the CLI exposes this; the web UI doesn't):

```sh
mgd aspect list --jsonl                     # what aspect types exist here?
mgd aspect create my-domain --name "My Domain" --schema @schema.json --json
mgd aspect delete my-domain                 # remove a definition; refused (409) if records still use it
mgd dataset aspect set ds-abc my-domain @values.json --json   # replace the whole aspect
mgd dataset aspect patch ds-abc dcat-dataset-strings '{"keywords":["a","b"]}' --json  # merge one field, keep the rest
mgd dataset aspect get ds-abc my-domain     # already JSON; --json optional
```

Remember the **`set` vs `patch`** rule (in `SKILL.md`): `patch` to change some
fields, `set` only to overwrite the whole aspect.
