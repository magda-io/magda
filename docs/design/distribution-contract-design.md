# Distribution Contract Design

## Status

Proposed design for a Magda v7 capability. Implementation targets the `main` branch.

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

## Core implementation conventions established by #3820

The completed Data Dictionary core (#3807 / #3820) established conventions that the Distribution Contract should follow unless this design explicitly requires something different:

- built-in aspect schemas use **JSON Schema draft-07**, matching the Registry validator;
- `schemaVersion` accepts compatible `1.x` payloads and consumers fail closed on unsupported major versions;
- representative compatibility fixtures live under `magda-registry-aspects/examples/<aspect>/`, are schema-tested and are published with the aspect package;
- shared TypeScript consumers use a typed model plus a defensive normalizer and cross-reference validator rather than reading arbitrary `rawData`;
- defensive normalization must not silently change values that are valid under the schema and must never invent stable semantic identities;
- provenance uses nearest-wins inheritance without merging, plus property-level overrides for mixed-origin curation;
- explicit provenance objects must state a non-empty `method` and/or `reviewStatus`; detail-only/empty objects must not mask inherited provenance;
- Data Understanding sections render below the existing preview(s), outside the preview gate;
- whole-aspect manual authoring uses `mgd dataset aspect set|get`; Registry merge-patch is not suitable for editing elements inside arrays such as operations because arrays are combined rather than matched by ID.

TypeScript provenance helpers should reuse/refactor the semantics already implemented for `data-dictionary` where practical, while preserving the existing Data Dictionary exports.

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
      "sourceIdentifier": "searchOccurrences",
      "label": "Search occurrence records",
      "purpose": "Search records by taxon and optional spatial or temporal filters",
      "interactionType": "query",
      "method": "GET",
      "path": "/occurrences/search",
      "endpointUrl": "https://example.org/api/occurrences/search",
      "parameters": [
        {
          "name": "q",
          "sourceIdentifier": "q",
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
        "statusCodes": [200],
        "recordsPath": "/occurrences",
        "dictionaryEntity": "occurrence-record",
        "pagination": {
          "type": "offset-limit",
          "limitParameter": "pageSize",
          "offsetParameter": "offset",
          "totalPath": "/total"
        }
      },
      "interactiveExampleCandidate": true
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

## Minimum v1 structural requirements

For schema version 1:

- the top-level object requires a non-empty supported `schemaVersion`;
- `operations` is optional (a simple downloadable/manual-access distribution may need no operation list);
- every operation requires a non-empty stable `id`;
- every scalar parameter requires non-empty `name`, `location` and normalized `type`;
- operation/parameter `sourceIdentifier` values are optional but should be preserved when the native source supplies stable identifiers;
- request/response `dictionaryEntity` references are non-empty entity IDs local to the same distribution's `data-dictionary`;
- explicit provenance objects obey the common non-empty `method` / `reviewStatus` rule;
- unknown additive properties are allowed within v1 and consumers ignore what they do not understand.

An operation does not become executable merely because it is structurally valid. Tool/execution derivation additionally requires an approved adapter to resolve an endpoint, authentication, target/network policy and request/response limits.

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

This object must never contain actual credentials or tokens. It may describe a mechanism/scheme and non-secret requirements such as OAuth scopes or documentation, but a future execution component is responsible for resolving/binding credentials through an appropriate secret/authentication system.

Credential-bearing values such as API keys, bearer/Authorization headers and authentication cookies are **not ordinary operation parameters**. They belong to this descriptive authentication metadata plus the separate execution/delegation system. An operation may provide a descriptive authentication override when it differs from the contract-level default.

## Operations

`operations` is a curated list of interactions that are useful for discovery, documentation or future execution. It must not be a full duplicate of an OpenAPI paths object.

Each operation may contain:

- `id` — stable within the contract;
- optional `sourceIdentifier` — stable native operation identifier where available (for example OpenAPI `operationId`);
- `label`;
- `purpose`;
- optional `interactionType` — open descriptive vocabulary such as `query`, `download`, `read`, `create`, `update`, `delete`, `action` or `unknown`;
- `method`;
- `path` and/or an operation-specific absolute `endpointUrl`;
- `parameters`;
- optional descriptive authentication override;
- request-body dictionary reference;
- response metadata, including record path and pagination hints;
- source constraints relevant to the operation;
- optional `interactiveExampleCandidate` hint;
- optional operation-level `provenance` / `propertyProvenance` overrides.

`interactionType` and `interactiveExampleCandidate` are descriptive/advisory only. They do not authorize execution or remove the need for confirmation/policy checks. The contract deliberately avoids calling an operation intrinsically “safe”.

### Stable identity and provenance inheritance

`operation.id` must be stable within the contract and should remain stable across re-harvesting while the source operation is logically the same.

Contract nodes inherit aspect-level `provenance`. An operation may provide its own `provenance` override when the node as a whole was manually curated/reviewed or came from a different source. A parameter may do the same.

Operations and parameters may additionally carry optional `propertyProvenance` maps when only selected properties differ in origin/review state. For example, `method`, `path` and parameter type may remain authoritative source metadata while a human-reviewed `purpose` or parameter `description` is preserved across automatic refresh.

For refresh/merge purposes, operations should preserve `sourceIdentifier` when available. Parameters should also use a stable native `sourceIdentifier` when one exists; otherwise the matching identity is the pair `location + name`.

If a producer can deterministically resolve a full operation URL, it should populate operation-level `endpointUrl`. Otherwise `path` remains the protocol/native operation path and only a protocol-aware execution adapter may combine it with the contract-level endpoint. Generic clients must not guess URL composition by arbitrary string concatenation.

Use the same protection semantics as the implemented Data Dictionary contract:

- inheritance is nearest-wins without merging: property override → parameter/operation → contract;
- each explicit provenance object must contain a **non-empty** `method` and/or `reviewStatus`;
- `manual`, `reviewed` and `custodian-approved` effective provenance is protected from silent automatic replacement;
- inferred/agent-generated/unreviewed/rejected content remains advisory unless subsequently reviewed.

A reviewed/manual node or property should not be silently overwritten by an automatic producer. If source structure changes in a way that cannot be reconciled safely, preserve the reviewed value and surface the conflict for review. The storage representation for conflicts remains part of #3814's first producer/merge design rather than this core ticket.

### Parameters

Scalar path/query/header parameters belong in the contract because they describe how an operation is invoked.

A parameter may contain the invocation metadata below and may additionally carry an optional `provenance` override when its origin/review state differs from the operation:

```json
{
  "name": "bbox",
  "sourceIdentifier": "bbox",
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

The parameter `type` / `format` vocabulary should align with the normalized logical types used by `data-dictionary` where applicable. The core v1 parameter model is for scalar invocation values; complex structured bodies belong in the request-body Data Dictionary entity.

Credential-bearing authentication inputs are excluded from ordinary parameters entirely. Non-secret header/cookie parameters may be described, but the UI must not infer that an arbitrary header/cookie is safe to edit or send.

### Structured request bodies

Complex request bodies should reference a `data-dictionary` entity instead of duplicating a large field model inside the operation.

Example:

```json
{
  "request": {
    "required": true,
    "mediaTypes": ["application/json"],
    "dictionaryEntity": "search-request"
  }
}
```

### Responses

The response description should contain only interaction-level information:

- media type(s);
- success/status information where useful;
- record/root path;
- paging hints;
- reference to the response entity in `data-dictionary`.

For JSON responses, `recordsPath` should use an **[RFC 6901 JSON Pointer](https://www.rfc-editor.org/rfc/rfc6901)** to the array/object containing the logical records (for example `/occurrences`). This gives agents/adapters deterministic extraction semantics without inventing a Magda-specific path language.

An optional pagination object should use an open `type` vocabulary and may describe known request parameters / response pointers, for example:

```json
{
  "pagination": {
    "type": "cursor",
    "limitParameter": "pageSize",
    "cursorParameter": "cursor",
    "nextCursorPath": "/paging/nextCursor",
    "totalPath": "/paging/total"
  }
}
```

Initial useful properties include `limitParameter`, `offsetParameter`, `pageParameter`, `cursorParameter`, `nextCursorPath`, `nextLinkPath` and `totalPath`. Pagination request-parameter properties refer to the `name` of a query parameter in the same operation; the semantic validator should reject unresolved references. JSON response-path fields use RFC 6901 JSON Pointer. These are descriptive source hints, not Magda execution limits.

The field-level response schema belongs in `data-dictionary`. `dictionaryEntity` refers to an entity in the **same distribution's** `data-dictionary` aspect.

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
      "interactiveExampleCandidate": true
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
    "sourceFingerprint": "sha256:...",
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

As with Data Dictionary, vocabularies remain open, but an explicit provenance object must contain a non-empty `method` and/or `reviewStatus` so it cannot accidentally mask inherited provenance while saying nothing.

`lastVerified` records when the endpoint/interface was last checked successfully. It should not be interpreted as a guarantee of availability or as execution authorization.

## Delivery and metadata production model

The core v7 Distribution Contract capability consists of:

- the built-in `distribution-contract` aspect schema;
- typed model/client access;
- read-only **How to use** UI;
- a supported manual population path through Registry APIs, `mgd`, project tooling or an agent.

Automatic source-specific harvesting is deliberately **not a prerequisite** for the core contract. Projects can curate operation/access metadata immediately, which also allows downstream machine consumers such as the v8 Agent Platform (#3810) to use deterministic contract metadata before every protocol has an automatic producer.

Manual/custodian metadata is first-class. Human-authored operation purposes, descriptions, safety hints and other reviewed annotations must not be silently overwritten by later producer runs.

Automatic production should be pluggable:

- use **connector-native generation** when a connector already possesses authoritative service/specification metadata;
- use a **minion-style enrichment producer** when an existing distribution can be inspected after ingestion;
- allow project/domain-specific producers for specialised protocols;
- keep shared normalization/validation/merge semantics reusable across producers.

A single source adapter may populate both `distribution-contract` and `data-dictionary` when one native source provides both interface and structure metadata, avoiding duplicate fetch/parse work.

### Manual population with `mgd`

The generic aspect commands are sufficient for the core/manual workflow, for example:

```text
mgd dataset aspect set <distribution-id> distribution-contract @distribution-contract.json
mgd dataset aspect get <distribution-id> distribution-contract --json
```

Do not use Registry merge-patch / `mgd dataset aspect patch` to edit elements inside `operations` or `parameters`: arrays are combined rather than matched by operation/parameter identity. For a targeted nested edit, read the aspect and send an RFC 6902 JSON Patch through `mgd api request`, following the same authoring rule documented for `data-dictionary`.

No protocol-specific `mgd` execution command is implied by this metadata-authoring path.

## Automatic producers

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

Manual or agent-assisted population is supported regardless of whether an automatic producer exists. An editor/agent may create or curate a contract from documentation and bounded inspection. Such contracts must clearly report their provenance.

Later producer runs must merge source-derived facts with existing reviewed human annotations rather than unconditionally replacing the whole contract.

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

Following the page-placement convention implemented in #3820, **How to use** is rendered below the existing preview(s), outside the preview gate, alongside the existing Data Understanding sections. Do not move the preview or make this section depend on preview availability. Keep the already-implemented Structure section intact; the initial implementation may append How to use after it.

A later interactive explorer may render a bounded query form only for operations explicitly marked `interactiveExampleCandidate` **and** when local execution/auth/network policy permits it. The candidate flag is never execution authority.

## Agent and query-gateway consumption

A machine client should be able to combine:

- `distribution-contract` to determine how to call a resource;
- `data-dictionary` to understand request/response fields;
- existing Magda access metadata to determine catalogue-side accessibility;
- a separate credential/execution policy system to actually perform authorised queries.

The contract may therefore become a source for tool definitions, but agents/adapters should consume the **validated/normalized** contract, not arbitrary raw aspect JSON. Stable distribution + operation identity should drive tool identity; `interactionType`, parameters, request/response entities, JSON-pointer record paths and pagination hints can drive deterministic tool descriptions.

Credential values are resolved through #3810's delegated-auth mechanism, never copied from this aspect or represented as ordinary parameters. Runtime execution still validates target/egress, permissions, request values, response limits and confirmation policy.

The contract must not itself contain secrets or claim execution authority.

## Validation, normalization and compatibility fixtures

The core implementation should mirror the consumer-safety pattern established by #3820.

A shared `@magda/typescript-common/dist/distribution-contract/*` module should provide:

- typed model definitions;
- `normalizeDistributionContract` (or equivalent): fail closed on unsupported major versions, deeply sanitize unvalidated Registry data, preserve all schema-valid v1 values, and never invent stable operation/parameter identities;
- `validateDistributionContract` (or equivalent): validate semantic/cross-reference rules that JSON Schema cannot express;
- provenance resolution/protection helpers using the common Data Understanding semantics.

Cross-reference validation should cover at least:

- unique operation IDs;
- unique parameter identity within an operation (prefer `sourceIdentifier`; otherwise `location + name`);
- valid request/response `dictionaryEntity` references when the same distribution's Data Dictionary is provided;
- pagination parameter references to actual operation parameters;
- JSON-pointer syntax for JSON response record/pagination paths.

Representative fixtures should live under `magda-registry-aspects/examples/distribution-contract/`, be validated against the draft-07 built-in schema, and be published with the npm package. At minimum cover:

1. simple HTTP download;
2. REST/OpenAPI query with scalar parameters, request/response dictionary references and pagination;
3. ArcGIS Feature Service query;
4. OGC API / STAC-style query service;
5. authenticated/restricted service with **descriptive authentication only** and no credential values;
6. mixed source-derived + manually reviewed operation/parameter metadata;
7. absence of the aspect on existing distributions.

The web client should use the normalized typed value and degrade safely when Registry schema validation is disabled.

## Drift detection

Where a native specification exists, producers may calculate a fingerprint and periodically compare it with the stored value.

A detected change should trigger re-harvesting/re-generation and comparison with the stored contract. Stable operation IDs/paths/parameter identities should be used where possible to preserve reviewed human annotations while updating source-derived structural/capability facts. Ambiguous/conflicting changes should be marked for review rather than silently replacing custodian-reviewed metadata.

The first automatic producer should establish and test a consistent merge policy that later protocol/source producers can reuse.

## Compatibility and evolution

The aspect is additive; distributions without it continue to work normally.

Within `schemaVersion` major version 1:

- new optional fields may be added;
- consumers should ignore unknown fields;
- existing field meanings must not change incompatibly;
- typed consumers may accept compatible `1.x` payloads, but must fail closed on an unsupported major version rather than interpreting it with v1 semantics.

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
- Aspect-, operation- and parameter-level inherited provenance plus property-level overrides are sufficient to preserve mixed reviewed/manual curation across later automatic refresh.
- Provenance inheritance/protection semantics are consistent with the implemented Data Dictionary contract and empty/detail-only provenance cannot mask inherited protection.
- Operation/parameter identities are stable enough for later producer merge and deterministic agent-tool derivation; the normalizer never invents them.
- JSON response record/pagination paths have deterministic semantics, and pagination parameter references can be validated.
- Credential-bearing authentication inputs are never represented as ordinary operation parameters.
- `interactiveExampleCandidate` is explicitly advisory and never grants execution authority.
- Representative compatibility fixtures are schema-tested/published, and typed normalization does not silently lose schema-valid v1 values.
- The core aspect/UI is useful with manually populated contracts; automatic harvesting is not required for the first usable v7 milestone.
- Automatic refresh can preserve human-authored/reviewed annotations rather than requiring whole-aspect replacement.
