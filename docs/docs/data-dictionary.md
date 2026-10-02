# Data Dictionary: authoring and consuming the `data-dictionary` aspect

The built-in `data-dictionary` aspect describes **what data a distribution actually contains**: its entities (tables, sheets, feature layers, API request/response bodies, variable sets), their fields and stable field paths, types, units, descriptions, semantic concepts, keys, relationships and dimensions, together with **provenance and review state**.

- Design: [Unified Data Dictionary Design](../design/data-dictionary-design.md) (part of the [Data Understanding Layer](../design/data-understanding-layer-design.md)).
- JSON Schema: [`magda-registry-aspects/data-dictionary.schema.json`](../../magda-registry-aspects/data-dictionary.schema.json) (aspect id `data-dictionary`, distribution records). It is registered automatically by the registry aspects migrator.
- Example payloads for every documented v1 source family: [`magda-registry-aspects/examples/data-dictionary/`](../../magda-registry-aspects/examples/data-dictionary/).
- Shared TypeScript model and helpers: `@magda/typescript-common/dist/data-dictionary/*.js`.

The aspect is optional and additive: distributions without it render exactly as before. When it is present, the distribution page shows a read-only **Structure** section (entity selector, searchable field table, types/source types, descriptions, units, required/nullable, semantic concepts, provenance/review indicators and a link to the native schema/specification). The section is shown even when the distribution cannot be previewed (e.g. query-only or restricted services).

Automatic producers (harvesting/inference, tracked in [#3813](https://github.com/magda-io/magda/issues/3813)) are **not** required: dictionaries can be authored manually today, and manual/custodian input remains a first-class source once producers exist.

## Minimal payload

```json
{
  "schemaVersion": "1.0",
  "provenance": { "method": "manual", "reviewStatus": "reviewed" },
  "entities": [
    {
      "id": "observations",
      "name": "Observations",
      "role": "table",
      "fields": [
        { "path": "site_id", "name": "site_id", "type": "string" },
        {
          "path": "temperature",
          "name": "temperature",
          "type": "number",
          "unit": "Cel",
          "unitSystem": "UCUM",
          "description": "Air temperature at 2 m"
        }
      ]
    }
  ]
}
```

Required properties: `schemaVersion` and `entities` at the top level; `id`, `name` and `fields` for an entity; `path`, `name` and `type` for a field (use `"unknown"` when no useful type is known). Everything else is optional. Unknown additional properties are allowed and must be ignored by consumers.

## Field paths

`path` is the field's stable identity within its entity, used for matching (keys, relationships, later re-harvesting) and display:

| Path                           | Meaning                              |
| ------------------------------ | ------------------------------------ |
| `scientificName`               | top-level field                      |
| `properties.location.latitude` | nested object property               |
| `items[].measurements[].value` | `[]` traverses array items           |
| `a\.b`                         | a single field literally named `a.b` |
| `field\[\]`                    | a field literally named `field[]`    |

A backslash escapes the reserved characters `\`, `.`, `[` and `]`; escaping any other character is invalid. For flat tabular data, `name` is always the exact source column name (e.g. `"name": "a.b"`, `"path": "a\\.b"` in JSON). Use `escapeFieldPathSegment` / `formatFieldPath` / `parseFieldPath` from `@magda/typescript-common/dist/data-dictionary/fieldPath.js` rather than building paths by hand.

## Provenance and review state

Provenance is inherited, **nearest wins** (no merging):

1. `propertyProvenance[<property>]` on the node (for a single property, e.g. `description`);
2. the node's own `provenance` (field → entity);
3. the dictionary-level `provenance`.

`method` is one of `authoritative-import`, `harvested`, `inferred`, `manual`, `agent-generated` (open vocabulary); `reviewStatus` is one of `unreviewed`, `reviewed`, `custodian-approved`, `rejected`. Inferred dictionaries must record the `sample` extent (`rows`/`bytes`).

Use property-level provenance for mixed-origin metadata, e.g. a type harvested from ArcGIS with a custodian-written description:

```json
{
  "path": "commodity",
  "name": "COMMODITY",
  "type": "string",
  "sourceType": "esriFieldTypeString",
  "description": "Commercial crop classification used by the survey",
  "propertyProvenance": {
    "description": {
      "method": "manual",
      "reviewStatus": "custodian-approved"
    }
  }
}
```

Rules for anything that writes the aspect, including future automatic producers and agents:

- Keep entity `id`s and field `path`s stable; prefer native identifiers (`sourceIdentifier`, `sourcePath`).
- Metadata whose effective provenance is `method: "manual"` or `reviewStatus: "reviewed" | "custodian-approved"` is **protected** (`isProtectedProvenance()`): do not overwrite it automatically. Refresh only unprotected, source-derived properties.
- When a source change cannot be applied safely, keep the protected value and record a `conflicts` entry on the node (`property`, `reason`, `candidateValue`, `sourceFingerprint`, ...). The UI flags such fields as "Needs review".
- Record `source.fingerprint` (and optionally `provenance.sourceFingerprint` on reviewed values) so source drift can be detected.
- Mark agent-written content `method: "agent-generated"`; it is shown as advisory until reviewed.
- Only declare `relationships` / `reference` roles backed by authoritative metadata, explicit user input or reviewed evidence: similar field names are not evidence of a join.
- Scalar API invocation parameters belong in `distribution-contract`, not here; request/response bodies are dictionary entities (`role: "request-body"`, `"response-record"`, ...).

## Populating a dictionary with `mgd`

The generic aspect commands work on distribution records; no dictionary-specific command is needed:

```sh
# create or replace the whole dictionary
mgd dataset aspect set <distribution-id> data-dictionary @data-dictionary.json

# read it back (machine-readable)
mgd dataset aspect get <distribution-id> data-dictionary --json
```

`mgd dataset aspect patch` performs a server-side JSON merge. Objects are merged key by key, but arrays are **combined, not matched by `id`/`path`**: patching `entities`, `fields` or `relationships` appends changed elements alongside the old ones and produces duplicates (which `validateDataDictionary()` reports). Use `patch` only for top-level objects such as `source` or `provenance`:

```sh
mgd dataset aspect patch <distribution-id> data-dictionary '{"provenance":{"method":"manual","reviewStatus":"custodian-approved"}}'
```

For a targeted edit inside `entities` (e.g. one field's description) send an RFC 6902 JSON Patch to the registry instead, addressing the element by index (read the aspect first to find it):

```sh
cat > patch.json <<'EOF'
[
    { "op": "add", "path": "/entities/0/fields/2/description", "value": "Air temperature at 2 m" },
    { "op": "add", "path": "/entities/0/fields/2/propertyProvenance", "value": { "description": { "method": "manual", "reviewStatus": "custodian-approved" } } }
]
EOF
mgd api request PATCH /v0/registry/records/<distribution-id>/aspects/data-dictionary --body-file patch.json
```

The registry only validates aspect data against the JSON schema when `validateJsonSchema` is enabled, so validate before writing.

## Validating and consuming programmatically

```ts
import { validateDataDictionary } from "@magda/typescript-common/dist/data-dictionary/validate.js";
import {
  getEffectiveProvenance,
  isAdvisoryProvenance
} from "@magda/typescript-common/dist/data-dictionary/provenance.js";
```

- Validate the payload against `data-dictionary.schema.json` (any draft-07 validator), then call `validateDataDictionary()` for the cross-reference rules a JSON Schema cannot express: unique entity ids / field paths / dimension ids / relationship ids, `primaryKey` and relationship field paths that exist, field `dimensions` that exist, and matching source/target field counts. It returns `[]` when no issue is found, otherwise issues with a JSON Pointer `location`.
- `normalizeDataDictionary()` leniently coerces unvalidated registry data for display (the web client uses it).
- `getEffectiveProvenance(dictionary, [entity, field], "description")` resolves inherited / property-level provenance; `isAdvisoryProvenance()` tells a client (or agent) to treat inferred, agent-generated or rejected values as advisory rather than authoritative.

Agents should use the dictionary to pick valid field paths and entity shapes, reason about types/units/semantic concepts, and avoid inventing fields the source does not expose.
