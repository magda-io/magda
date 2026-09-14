# Unified Data Dictionary Design

## Status

Proposed design for a future Magda v7 capability.

This document defines the `data-dictionary` distribution aspect introduced by the [data understanding layer](./data-understanding-layer-design.md).

## Purpose

Different data sources expose their structure in different ways:

- CSV/Excel: columns;
- JSON APIs: nested properties;
- ArcGIS: layer fields, domains and geometry metadata;
- relational/query sources: tables and columns;
- NetCDF: dimensions, coordinates and variables;
- OpenAPI/JSON Schema: request/response schemas;
- manually documented sources: field lists and descriptions.

Magda needs one normalized representation that allows users and software clients to answer:

- what fields are available;
- what type/format/unit each field uses;
- what the field means;
- whether the definition is authoritative or inferred;
- how nested fields are addressed;
- which semantic concept the field represents;
- which entity or response shape the field belongs to.

The `data-dictionary` aspect provides that representation.

## Goals

The design should:

- work for both flat and nested data;
- preserve enough source detail for useful interpretation without copying entire native schemas;
- support multiple entities/tables/layers within one distribution;
- support API request and response bodies where appropriate;
- preserve provenance and review state;
- align with common external schema concepts where practical;
- provide a stable machine-readable basis for UI rendering, semantic mediation and future agent/query tooling.

## Non-goals

The data dictionary does not:

- replace native schemas such as JSON Schema, OpenAPI, ArcGIS layer definitions or NetCDF metadata;
- store arbitrary samples as a substitute for schema metadata;
- guarantee that inferred types are complete or authoritative;
- define access-control policy;
- define API invocation parameters that belong in `distribution-contract`;
- automatically prove that fields from two datasets can be joined;
- require every source type to populate every possible property.

## Aspect ID and placement

Aspect ID:

```text
data-dictionary
```

Record type:

```text
distribution
```

Built-in JSON Schema location:

```text
magda-registry-aspects/data-dictionary.schema.json
```

## Core model

The dictionary is organized around **entities**. An entity is a logical record shape such as:

- a CSV table;
- an Excel sheet;
- an ArcGIS layer feature;
- an API response record;
- an API request body;
- a database table;
- a NetCDF variable collection.

Each entity contains fields addressed by stable field paths.

## Proposed v1 shape

```json
{
  "schemaVersion": "1.0",
  "source": {
    "type": "arcgis-layer-definition",
    "url": "https://example.org/FeatureServer/0?f=pjson",
    "retrievedAt": "2026-09-14T10:00:00Z",
    "fingerprint": "sha256:..."
  },
  "generation": {
    "method": "authoritative-import",
    "generator": "magda-data-dictionary-harvester/1.0",
    "generatedAt": "2026-09-14T10:00:00Z",
    "reviewStatus": "unreviewed"
  },
  "entities": [
    {
      "id": "tree-crop-feature",
      "name": "Tree crop feature",
      "role": "response-record",
      "description": "One mapped tree-crop feature",
      "fields": [
        {
          "path": "commodity",
          "name": "commodity",
          "type": "string",
          "description": "Mapped tree-crop commodity",
          "semanticConcept": "crop-type"
        },
        {
          "path": "year",
          "name": "year",
          "type": "string",
          "description": "Feature-level mapping currency"
        },
        {
          "path": "hectares",
          "name": "hectares",
          "type": "number",
          "unit": "ha",
          "description": "Mapped feature area"
        }
      ]
    }
  ]
}
```

## `schemaVersion`

Required string for the normalized dictionary contract.

Initial value:

```text
1.0
```

Consumers should tolerate unknown additive properties in the same major version.

## Source metadata

The `source` object describes the schema/metadata source used to build the dictionary.

Suggested properties:

- `type`;
- `url` where applicable;
- `retrievedAt`;
- `fingerprint`;
- native version/identifier where available.

Example source types:

- `frictionless-table-schema`;
- `openapi`;
- `json-schema`;
- `arcgis-layer-definition`;
- `ogc-schema`;
- `stac`;
- `netcdf-metadata`;
- `file-inspection`;
- `sample-inference`;
- `manual`;
- `agent-inspection`.

## Generation metadata

The `generation` object explains how the normalized dictionary was produced.

Suggested fields:

```json
{
  "method": "inferred",
  "generator": "magda-csv-inspector/1.0",
  "generatedAt": "2026-09-14T10:00:00Z",
  "sample": {
    "rows": 100,
    "bytes": 65536
  },
  "reviewStatus": "unreviewed"
}
```

Initial `method` values:

- `authoritative-import`;
- `harvested`;
- `inferred`;
- `manual`;
- `agent-generated`.

Initial `reviewStatus` values:

- `unreviewed`;
- `reviewed`;
- `custodian-approved`;
- `rejected`.

Where inference is based on samples, the sample extent must be recorded so the UI does not present it as complete-source authority.

## Entities

Each entity should have:

- `id` — stable within the dictionary;
- `name` — human-readable label;
- optional `description`;
- optional `role`;
- optional source/native identifier;
- `fields`;
- optional entity-level constraints or geometry metadata.

Initial `role` examples:

- `table`;
- `sheet`;
- `response-record`;
- `response-envelope`;
- `request-body`;
- `feature`;
- `database-table`;
- `variable-set`;
- `other`.

The role is descriptive and extensible rather than a closed list.

## Fields

A normalized field should support the following core properties.

### Identity

- `path` — stable path within the entity;
- `name` — display/source field name;
- optional `title`.

`path` is required because nested JSON cannot be represented reliably by `name` alone.

Examples:

```text
scientificName
occurrences[].scientificName
properties.location.latitude
items[].measurements[].value
```

The first version should use a documented lightweight path notation suitable for display and machine matching. It does not need to implement the full JSONPath language.

### Type and format

Suggested normalized values for `type`:

- `string`;
- `integer`;
- `number`;
- `boolean`;
- `date`;
- `datetime`;
- `time`;
- `object`;
- `array`;
- `geometry`;
- `binary`;
- `unknown`.

`format` may preserve useful source-specific refinement such as:

- `uri`;
- `uuid`;
- `email`;
- `decimal`;
- `int64`;
- `geojson-geometry`;
- source-specific date format strings.

The normalized model should avoid pretending that all source type systems map perfectly. A `sourceType` property may retain the original native type where useful.

### Description and semantics

- `description`;
- `semanticConcept`;
- optional aliases/labels.

`semanticConcept` may be a stable URI or another controlled identifier, for example a Darwin Core term URI.

This field is the main bridge toward later semantic mediation, but the first implementation must not require semantic concepts for ordinary dictionary rendering.

### Units and values

Useful optional properties:

- `unit`;
- `unitConcept`;
- `enum` / code list;
- `missingValues`;
- `default`;
- `example`;
- `minimum` / `maximum`;
- string length/pattern constraints.

For tabular resources, these concepts intentionally align with Frictionless Table Schema where practical.

### Nullability/requiredness

The dictionary may record:

- `required`;
- `nullable`;
- source constraints.

These properties should reflect the native schema when authoritative. When inferred from samples, the provenance must make that distinction visible.

### Field-level provenance overrides

Most fields inherit dictionary-level provenance, but a field may override it when the description or semantic mapping came from a different source.

Example:

```json
{
  "path": "hectares",
  "name": "hectares",
  "type": "number",
  "unit": "ha",
  "description": "Mapped feature area",
  "provenance": {
    "method": "agent-generated",
    "reviewStatus": "unreviewed"
  }
}
```

This allows Magda to express, for example, that the field type came from an authoritative ArcGIS schema while the human-readable description was added later by an agent.

## API request and response modelling

The boundary between `distribution-contract` and `data-dictionary` is important.

### Scalar invocation parameters

Path/query/header/cookie parameters belong in `distribution-contract.operations[].parameters` because they explain how an operation is invoked.

### Complex request bodies

A structured request body belongs in the data dictionary and is referenced from the operation:

```json
{
  "request": {
    "mediaTypes": ["application/json"],
    "dictionaryEntity": "search-request"
  }
}
```

### Response bodies

Response record/envelope structures belong in the dictionary and are referenced from the operation:

```json
{
  "response": {
    "mediaTypes": ["application/json"],
    "recordsPath": "occurrences",
    "dictionaryEntity": "occurrence-record"
  }
}
```

This design gives the UI a natural **Request fields / Response fields** presentation without storing the same field definitions in two aspects.

## Multiple tables, sheets and layers

One distribution can contain more than one logical entity.

Examples:

### Excel workbook

```text
entity: Sheet1 / Observations
entity: Sheet2 / Sites
```

### ArcGIS service root

```text
entity: layer-0 / Orchards
entity: layer-1 / Packing sheds
```

### API response

```text
entity: response-envelope
entity: occurrence-record
entity: facet-count
```

The UI should group fields by entity rather than flattening everything into one table.

## Geometry metadata

For feature-oriented entities, optional geometry metadata may include:

- geometry type;
- coordinate reference system;
- spatial dimension;
- geometry field/path.

Example:

```json
{
  "geometry": {
    "type": "Polygon",
    "crs": "EPSG:4326",
    "fieldPath": "geometry"
  }
}
```

This information may later help cross-dataset spatial mediation.

## Keys and identifiers

Optional field/entity metadata may mark:

- primary/key-like fields;
- external identifiers;
- semantic identifier schemes.

The initial UI should present this information descriptively. It must not assume that two similarly named identifier fields are join-compatible without explicit evidence.

## Source-specific harvesting

### CSV

Harvesting should:

- read headers;
- inspect a bounded sample;
- infer basic types/formats;
- record sample row/byte extent;
- preserve missing-value observations when useful;
- avoid claiming inferred values are authoritative.

If a Frictionless Table Schema is supplied, prefer it over inference and record it as the source.

### Excel

Harvesting should:

- enumerate sheets;
- treat each selected sheet as an entity;
- extract headers and bounded sample types;
- preserve sheet names;
- avoid materializing entire large workbooks solely for metadata generation.

### JSON / REST APIs

Preferred sources, in order:

1. explicit JSON Schema/OpenAPI schema;
2. another authoritative native schema;
3. bounded response sample inference.

Nested paths must be retained.

### OpenAPI

Harvesting should map reusable/request/response schemas into entities and connect operation request/response references through `distribution-contract`.

The dictionary should not embed the whole OpenAPI document.

### ArcGIS

Layer `?f=pjson` metadata can populate:

- native field name/type/alias;
- nullability/editability where relevant;
- coded-value/range domains;
- geometry metadata;
- object/global ID indicators;
- descriptions where supplied.

Field structure can therefore often be harvested without reading actual feature records.

### OGC API / STAC

Use exposed collection/schema metadata where available. If a schema is not available, bounded example inference may be used with explicit provenance.

### WMS

WMS capabilities primarily describe layers and rendering metadata, not row-level feature fields. The dictionary may therefore be absent or limited for pure WMS distributions. The UI should not treat that as an error.

### WFS

Feature type/schema metadata should be used when available and represented as feature entities.

### NetCDF

Harvesting should extract metadata without loading full arrays into memory where possible:

- dimensions;
- coordinates;
- variables;
- dtype;
- units;
- standard/long names;
- relevant attributes.

CF convention identifiers should be retained when available.

### Manual/agent-assisted sources

When a machine-readable schema is unavailable, an agent or editor may create a dictionary from bounded inspection/documentation. Provenance must state that origin clearly.

## Updating and drift

If the source exposes a stable schema/specification, the harvester should retain a fingerprint.

On change:

1. produce a newly harvested candidate dictionary;
2. compare it with the stored dictionary;
3. preserve reviewed manual annotations where they still map unambiguously;
4. mark changed/conflicting entries for review rather than silently presenting stale annotations as current;
5. update generated metadata timestamps/fingerprints.

Detailed merge UX can be implemented later, but the storage design must not make provenance impossible to preserve.

## Web-client design

The distribution page should render a **Structure** or **Data dictionary** section whenever the aspect exists.

The first version should support:

- entity selector/grouping when multiple entities exist;
- searchable field table;
- field name/path;
- normalized type and source type;
- description;
- unit;
- required/nullability where known;
- semantic concept where present;
- provenance/review indicator;
- source/specification link.

Nested fields should be understandable without dumping raw JSON Schema.

For APIs, the operation view can link to the relevant request/response entities, producing a user experience such as:

```text
Search occurrences
  Parameters
    q              string   required
    pageSize       integer  optional

  Response fields
    scientificName string
    eventDate       datetime
    latitude        number
    longitude       number
```

## Search and semantic indexing

A later phase may index selected dictionary text such as:

- field names/aliases;
- descriptions;
- semantic concepts;
- units;
- entity names.

This would allow searches such as "datasets containing scientific name and observation date".

Large dictionaries should be chunked/represented deliberately rather than copied wholesale into one search document.

## Agent consumption

An agent should be able to use the dictionary to:

- select relevant distributions;
- identify field paths for queries;
- understand output records;
- match semantic concepts;
- reason about units/types;
- avoid inventing fields that the source does not expose.

Generated/inferred metadata remains advisory unless backed by an authoritative source or review state.

## Compatibility and evolution

The aspect is optional and additive.

Existing `visualization-info` remains responsible for current preview-specific hints and should not be overloaded into the new dictionary. A future migration may reuse overlapping observations, but preview compatibility should not depend on completing such a migration.

Within schema version 1:

- add optional fields only;
- preserve existing meanings;
- allow consumers to ignore unknown properties.

## Acceptance criteria

- One model can represent CSV columns, nested API fields and ArcGIS layer fields.
- Multiple sheets/layers/entities are supported without flattening.
- Nested fields have stable paths.
- Types, formats, descriptions, units, constraints and semantic concepts can be represented independently.
- Request/response body structures can be represented without duplicating scalar API invocation parameters.
- Dictionary-level and field-level provenance/review state can distinguish authoritative from inferred/agent-generated content.
- CSV/Excel inference records the bounded sample used.
- ArcGIS dictionaries can be generated from layer definitions without requiring feature downloads.
- NetCDF variables/dimensions can be represented without requiring a universal visualisation.
- The web client can render a useful searchable dictionary without needing the native source schema format.
- Existing distributions without the aspect remain unaffected.
