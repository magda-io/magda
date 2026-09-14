# Distribution Contract Design

## Status

Proposed design for a future Magda v7 capability.

This document defines the `distribution-contract` aspect introduced by the [data understanding layer](./data-understanding-layer-design.md).

## Purpose

A Magda distribution may be a downloadable file, an API, a query service, a geospatial service or another remotely accessible representation. Existing DCAT-style metadata is useful for locating the resource, but it is often insufficient to explain how a client can interact with it.

The `distribution-contract` aspect provides a compact, normalised description of a distribution's usable interface. It is intended to support:

- human-readable API/service documentation in the web client;
- a future query form or safe data explorer;
- machine-readable tool definitions for software agents;
- future federated query adapters;
- automated endpoint verification;
- schema/interface drift detection;
- consistent comparison of heterogeneous data services.

It is deliberately smaller than a native service specification. When OpenAPI, ArcGIS REST metadata, OGC capabilities, STAC metadata or another authoritative specification exists, the contract should reference that source rather than copy it wholesale.

## Scope

The aspect is attached to a **distribution record** because different distributions of the same dataset can expose different access mechanisms.

The first version should represent at least:

- ordinary downloadable resources;
- REST APIs described by OpenAPI or curated metadata;
- ArcGIS Feature/Map Services;
- OGC-style services where useful;
- STAC/OGC API style endpoints;
- query-only or restricted-access services.

The model should remain protocol-neutral enough to add other service types later.

## Non-goals

The contract does not:

- replace OpenAPI, JSON Schema, OGC capabilities, ArcGIS service definitions or other native specifications;
- store credentials, API keys, tokens, cookies or secret material;
- grant access or override Magda access-control policy;
- guarantee that an endpoint is currently reachable;
- define a complete query language for all protocols;
- require Magda to execute every operation it can describe;
- encode arbitrary workflow/orchestration logic.

## Aspect ID and placement

Aspect ID:

```text
distribution-contract
```

Record type:

```text
distribution
```

Built-in JSON Schema location:

```text
magda-registry-aspects/distribution-contract.schema.json
```

## Conceptual model

A contract has six concerns:

1. **identity** — what kind of resource/interface is this;
2. **endpoint** — where it is accessed;
3. **native specification** — where the authoritative machine-readable definition can be found;
4. **operations** — a curated subset of useful interactions;
5. **source capabilities/constraints** — what the remote source says it supports or restricts;
6. **provenance/verification** — where this contract came from and when it was checked.

These concerns should remain distinguishable so that, for example, a source-side maximum page size is not confused with a Magda gateway safety limit.

## Proposed v1 shape

The following is illustrative of the target schema rather than a requirement that every property be populated.

```json
{
  "schemaVersion": "1.0",
  "resourceRole": "data-service",
  "accessMode": "public-query",
  "protocol": "REST",
  "endpointUrl": "https://example.org/api/occurrences/search",
  "documentationUrl": "https://example.org/docs",
  "specification": {
    "type": "openapi",
    "url": "https://example.org/openapi.json",
    "version": "3.1.0",
    "fingerprint": "sha256:...",
    "retrievedAt": "2026-09-14T10:00:00Z"
  },
  "authentication": {
    "type": "none",
    "description": "Public endpoint; no credential required"
  },
  "operations": [
    {
      "id": "search-occurrences",
      "label": "Search occurrence records",
      "purpose": "Search records by taxon and optional spatial or temporal filters",
      "method": "GET",
      "path": "/occurrences/search",
      "parameters": [
        {
          "name": "q",
          "location": "query",
          "type": "string",
          "required": true,
          "description": "Taxon or query expression"
        },
        {
          "name": "pageSize",
          "location": "query",
          "type": "integer",
          "required": false,
          "default": 10,
          "maximum": 50
        }
      ],
      "response": {
        "mediaTypes": ["application/json"],
        "recordsPath": "occurrences",
        "dictionaryEntity": "occurrence-record"
      },
      "safeForInteractiveExample": true
    }
  ],
  "sourceCapabilities": {
    "allowedMethods": ["GET"],
    "maximumRecordsPerRequest": 50,
    "bulkExportAvailable": false
  },
  "provenance": {
    "method": "harvested",
    "sourceType": "openapi",
    "generatedAt": "2026-09-14T10:00:00Z",
    "reviewStatus": "unreviewed"
  },
  "lastVerified": "2026-09-14T10:05:00Z"
}
```

## Required and optional fields

### `schemaVersion`

Required string identifying the payload contract version.

Initial value:

```text
1.0
```

Consumers should tolerate unknown additive properties within the same major version.

### `resourceRole`

Optional normalised role describing what the distribution represents.

Initial values may include:

- `download`;
- `data-service`;
- `metadata-service`;
- `query-service`;
- `stream`;
- `other`.

This is descriptive and does not replace DCAT distribution semantics.

### `accessMode`

Optional human/machine hint about the interaction model.

Examples:

- `public-download`;
- `public-query`;
- `authenticated-query`;
- `query-only`;
- `restricted`;
- `manual-request`.

`accessMode` is not an authorisation decision. Existing Magda access/access-control metadata remains authoritative for Magda-side access.

### `protocol`

Required when the distribution is an interactive service.

The field should be a short stable string, for example:

- `REST`;
- `ArcGIS Feature Service`;
- `ArcGIS Map Service`;
- `OGC API Features`;
- `WFS`;
- `WMS`;
- `STAC`;
- `GraphQL`;
- `SQL`;
- `other`.

The schema should permit future protocol values rather than using a closed enum that requires a Magda release for every new protocol.

### `endpointUrl`

Primary endpoint for this representation.

For APIs this may be the API/service root. For a layer-oriented service it may be a layer endpoint. Existing `accessURL`/`downloadURL` remain valid DCAT-style access metadata; this field exists to make the contract self-contained for machine consumers.

### `documentationUrl`

Optional human-readable external documentation.

### `specification`

Optional pointer to the authoritative native specification.

Proposed fields:

- `type` — e.g. `openapi`, `json-schema`, `arcgis-service-definition`, `ogc-capabilities`, `stac`, `other`;
- `url`;
- `version` where known;
- `fingerprint` where calculated;
- `retrievedAt`.

The specification content itself should normally not be embedded in the aspect.

### `authentication`

Optional descriptive metadata about the mechanism expected by the remote source.

Examples:

```json
{ "type": "none" }
```

```json
{
  "type": "api-key",
  "description": "API key supplied by the custodian"
}
```

```json
{
  "type": "oauth2",
  "documentationUrl": "https://example.org/auth-docs"
}
```

This object must never contain actual credentials or tokens. A future execution component is responsible for resolving credentials through an appropriate secret/authentication system.

## Operations

`operations` is a curated list of interactions that are useful for discovery, documentation or future execution. It must not be a full duplicate of an OpenAPI paths object.

Each operation may contain:

- `id` — stable within the contract;
- `label`;
- `purpose`;
- `method`;
- `path` or operation-specific endpoint override;
- `parameters`;
- request-body dictionary reference;
- response metadata;
- source constraints relevant to the operation;
- `safeForInteractiveExample`.

### Parameters

Scalar path/query/header parameters belong in the contract because they describe how an operation is invoked.

A parameter may contain:

```json
{
  "name": "bbox",
  "location": "query",
  "type": "string",
  "required": false,
  "description": "Bounding box filter",
  "format": "minX,minY,maxX,maxY",
  "example": "150.0,-34.0,151.0,-33.0"
}
```

Supported `location` values should initially include:

- `path`;
- `query`;
- `header`;
- `cookie`.

The UI should not automatically render editable secret-bearing headers merely because they appear in the contract.

### Structured request bodies

Complex request bodies should reference a `data-dictionary` entity instead of duplicating a large field model inside the operation.

Example:

```json
{
  "request": {
    "mediaTypes": ["application/json"],
    "dictionaryEntity": "search-request"
  }
}
```

### Responses

The response description should contain only interaction-level information:

- media type(s);
- HTTP/status information where useful;
- record/root path;
- paging hints;
- reference to the response entity in `data-dictionary`.

The field-level response schema belongs in `data-dictionary`.

## Source capabilities versus Magda execution policy

The contract must distinguish what the **source** supports from what a future **Magda executor** permits.

For example:

```json
{
  "sourceCapabilities": {
    "allowedMethods": ["GET", "POST"],
    "maximumRecordsPerRequest": 10000
  }
}
```

does not imply that a Magda interactive explorer should allow both methods or 10,000 records.

A future gateway/explorer may impose stricter local policy such as:

- GET-only interactive examples;
- 50-record preview limit;
- 10-second timeout;
- response byte ceiling;
- allow-listed target hosts;
- blocked sensitive headers;
- rate limits.

Those execution policies should live in gateway/application configuration, not be presented as immutable facts about the source.

## Protocol-specific examples

### ArcGIS Feature Service

```json
{
  "schemaVersion": "1.0",
  "resourceRole": "query-service",
  "accessMode": "query-only",
  "protocol": "ArcGIS Feature Service",
  "endpointUrl": "https://example.org/arcgis/rest/services/TreeCrops/FeatureServer/0",
  "specification": {
    "type": "arcgis-service-definition",
    "url": "https://example.org/arcgis/rest/services/TreeCrops/FeatureServer/0?f=pjson",
    "retrievedAt": "2026-09-14T10:00:00Z"
  },
  "operations": [
    {
      "id": "query-features",
      "label": "Query features",
      "purpose": "Query mapped tree-crop features with attribute/spatial filters",
      "method": "GET",
      "path": "/query",
      "response": {
        "mediaTypes": ["application/json"],
        "dictionaryEntity": "tree-crop-feature"
      },
      "safeForInteractiveExample": true
    }
  ],
  "sourceCapabilities": {
    "bulkExportAvailable": false,
    "supportsSpatialFilter": true,
    "supportsPagination": true
  }
}
```

### Downloadable CSV

A simple file distribution can still have a compact contract:

```json
{
  "schemaVersion": "1.0",
  "resourceRole": "download",
  "accessMode": "public-download",
  "protocol": "HTTP",
  "endpointUrl": "https://example.org/data.csv"
}
```

The data dictionary carries the columns.

## Provenance and verification

The contract should include provenance that allows a consumer to judge its reliability.

Suggested fields:

```json
{
  "provenance": {
    "method": "harvested",
    "sourceType": "openapi",
    "sourceUrl": "https://example.org/openapi.json",
    "generatedAt": "2026-09-14T10:00:00Z",
    "generator": "magda-distribution-contract-harvester/1.0",
    "reviewStatus": "unreviewed"
  }
}
```

Initial `method` values:

- `authoritative-import`;
- `harvested`;
- `manual`;
- `agent-generated`;
- `inferred`.

Initial `reviewStatus` values:

- `unreviewed`;
- `reviewed`;
- `custodian-approved`;
- `rejected`.

`lastVerified` records when the endpoint/interface was last checked successfully. It should not be interpreted as a guarantee of availability.

## Harvesting

### OpenAPI

A harvester should:

1. retain the specification URL/version/fingerprint;
2. select useful data-facing operations rather than every administrative endpoint;
3. extract parameter names/types/descriptions/defaults/limits;
4. identify structured request/response schemas for the data dictionary;
5. record security scheme descriptions without credentials;
6. mark the generated content as harvested and unreviewed unless explicitly reviewed.

### ArcGIS

A harvester should inspect the service/layer JSON definition and normalise:

- service/layer endpoint;
- query operation;
- supported capabilities;
- pagination/max-record hints;
- geometry capability;
- layer fields into `data-dictionary`.

### OGC/STAC

A harvester should prefer machine-readable collection, schema and capabilities documents and expose a curated set of useful read/query operations.

### Manual/agent-assisted authoring

When no native specification exists, an editor or agent may create a contract from documentation and bounded inspection. Such contracts must clearly report their provenance.

## Web-client behaviour

The distribution page should render a **How to use** section when `distribution-contract` exists.

The section should show, where available:

- protocol/access mode;
- endpoint;
- documentation and specification links;
- authentication description;
- useful operations;
- operation purpose;
- parameters with required/default/range information;
- response entity link into the data dictionary;
- provenance/review status;
- last verification time.

The first implementation should be read-only.

A later interactive explorer may render a bounded query form only for operations explicitly marked `safeForInteractiveExample` and only when local execution policy permits it.

## Agent and query-gateway consumption

A machine client should be able to combine:

- `distribution-contract` to determine how to call a resource;
- `data-dictionary` to understand request/response fields;
- existing Magda access metadata to determine catalogue-side accessibility;
- a separate credential/execution policy system to actually perform authorised queries.

The contract may therefore become a source for tool definitions, but it must not itself contain secrets or claim execution authority.

## Drift detection

Where a native specification exists, harvesters may calculate a fingerprint and periodically compare it with the stored value.

A detected change should trigger re-harvesting and mark the contract/dictionary as changed or requiring review. Schema drift detection should not silently rewrite custodian-reviewed descriptions without preserving provenance/review state.

## Compatibility and evolution

The aspect is additive; distributions without it continue to work normally.

Within `schemaVersion` major version 1:

- new optional fields may be added;
- consumers should ignore unknown fields;
- existing field meanings must not change incompatibly.

A future incompatible model should use a new major schema version and provide a migration path before the built-in aspect definition is tightened in a way that invalidates existing records.

## Acceptance criteria

- The aspect can describe a REST/OpenAPI API without embedding the complete OpenAPI document.
- The aspect can describe ArcGIS and simple downloadable distributions using the same top-level model.
- Scalar operation parameters are represented without duplicating response-field definitions.
- Complex request/response bodies can reference `data-dictionary` entities.
- Source capabilities are distinguishable from Magda execution policy.
- Authentication metadata contains no credentials and does not override access-control authority.
- Native specification URL, fingerprint/retrieval information and provenance can be recorded.
- The web client can render useful read-only API/service documentation solely from the aspect.
- The same aspect is suitable for later agent/query-adapter consumption.
