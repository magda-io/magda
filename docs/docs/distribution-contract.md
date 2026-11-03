# Distribution Contract: authoring and consuming the `distribution-contract` aspect

The built-in `distribution-contract` aspect describes **how a distribution can be accessed or queried**: what kind of resource it is, its protocol and endpoint, where its native specification and documentation are, what authentication the source expects, a curated list of useful operations with their scalar parameters, request/response metadata (with links to `data-dictionary` entities), pagination hints and what the source reports it supports. It records **provenance and review state** throughout.

- Design: [Distribution Contract Design](../design/distribution-contract-design.md) (part of the [Data Understanding Layer](../design/data-understanding-layer-design.md)).
- JSON Schema: [`magda-registry-aspects/distribution-contract.schema.json`](../../magda-registry-aspects/distribution-contract.schema.json) (aspect id `distribution-contract`, distribution records). It is registered automatically by the registry aspects migrator.
- Example payloads (HTTP download, REST/OpenAPI, ArcGIS Feature Service, OGC API/STAC, authenticated service, mixed provenance): [`magda-registry-aspects/examples/distribution-contract/`](../../magda-registry-aspects/examples/distribution-contract/).
- Shared TypeScript model and helpers: `@magda/typescript-common/dist/distribution-contract/*.js`.

The aspect is optional and additive: distributions without it render exactly as before. When it is present, the distribution page shows a read-only **How to use** tab (protocol/access mode, endpoint, documentation/specification links, authentication description, source capabilities, operations with purposes and parameters, request/response entities linked to the **Structure** tab, pagination hints, provenance/review state and last verification time). It sits next to Structure, below the existing previews, and is shown even when the distribution cannot be previewed. Link to it with `#how-to-use` on the distribution page URL.

Automatic producers (harvesting from OpenAPI, ArcGIS, OGC/STAC, …, tracked in [#3814](https://github.com/magda-io/magda/issues/3814)) are **not** required: contracts can be authored manually today, and manual/custodian input remains a first-class source once producers exist.

## The contract is descriptive, not execution authority

- Describing an operation does **not** authorize anyone (or any agent) to execute it. `interactionType` and `interactiveExampleCandidate` are advisory hints. Whether an operation may run is decided by a separate runtime policy (authentication/delegation, network egress, allow/deny lists, size/time limits, confirmation), not by this aspect.
- `accessMode` and `authentication` don't grant or override access: Magda's access-control metadata stays authoritative for Magda-side access.
- `sourceCapabilities` are facts reported by the **source** (e.g. its maximum page size). They are not Magda execution limits: a future Magda gateway may apply stricter ones.
- **Never store credentials**: no API keys, bearer tokens, passwords, cookies or other secrets, anywhere in the aspect. `authentication` describes the mechanism only, e.g. "an API key in the `X-API-Key` header". Credential-bearing inputs (API keys, `Authorization`/`Proxy-Authorization` headers, auth cookies) are **not** operation `parameters`. The schema rejects `Authorization` header parameters, `validateDistributionContract()` also rejects a parameter that is the input `authentication` describes, and `normalizeDistributionContract()` drops both, so tools derived from the normalized contract never see a credential input as a parameter.
- Every `authentication` object must state its mechanism in `type` (use `"none"` for public access and `"other"` for anything unusual). An operation's `authentication` replaces the contract-level one, so an empty or detail-only object would otherwise hide it.

## Minimal payloads

A downloadable file needs very little:

```json
{
  "schemaVersion": "1.0",
  "resourceRole": "download",
  "accessMode": "public-download",
  "protocol": "HTTP",
  "endpointUrl": "https://example.org/data.csv",
  "provenance": { "method": "manual", "reviewStatus": "reviewed" }
}
```

An API with one curated operation:

```json
{
  "schemaVersion": "1.0",
  "resourceRole": "data-service",
  "accessMode": "public-query",
  "protocol": "REST",
  "endpointUrl": "https://example.org/api",
  "documentationUrl": "https://example.org/docs",
  "specification": {
    "type": "openapi",
    "url": "https://example.org/openapi.json",
    "version": "3.1.0"
  },
  "authentication": { "type": "none" },
  "operations": [
    {
      "id": "search-occurrences",
      "sourceIdentifier": "searchOccurrences",
      "label": "Search occurrence records",
      "purpose": "Search records by taxon",
      "interactionType": "query",
      "method": "GET",
      "path": "/occurrences/search",
      "endpointUrl": "https://example.org/api/occurrences/search",
      "parameters": [
        {
          "name": "q",
          "location": "query",
          "type": "string",
          "required": true
        },
        {
          "name": "pageSize",
          "location": "query",
          "type": "integer",
          "default": 10,
          "maximum": 50
        },
        {
          "name": "offset",
          "location": "query",
          "type": "integer",
          "default": 0
        }
      ],
      "response": {
        "mediaTypes": ["application/json"],
        "recordsPath": "/occurrences",
        "dictionaryEntity": "occurrence-record",
        "pagination": {
          "type": "offset-limit",
          "limitParameter": "pageSize",
          "offsetParameter": "offset",
          "totalPath": "/total"
        }
      }
    }
  ],
  "provenance": { "method": "manual", "reviewStatus": "unreviewed" }
}
```

Only `schemaVersion` is required at the top level. An operation requires a non-empty `id`. A parameter requires a non-empty `name`, `location` (`path`, `query`, `header` or `cookie`) and `type` (a `data-dictionary` logical type such as `string`, `integer`, `number`, `boolean`, `date`, `datetime`; use `"unknown"` when no useful type is known). Everything else is optional. Vocabularies (`resourceRole`, `accessMode`, `protocol`, `interactionType`, pagination `type`, …) are open, and unknown additional properties are allowed and must be ignored by consumers.

## Identities, endpoints and references

- **Operation `id`** must be unique and stable within the contract, and stay the same across re-harvesting while the source operation is logically the same. Record the native identifier (e.g. OpenAPI `operationId`) in `sourceIdentifier` when there is one.
- **Parameters** are identified by `sourceIdentifier` when present, otherwise by `location` + `name` (`getParameterIdentity()`). A `sourceIdentifier` must not be empty: leave it out when the source has none. Within an operation, `location` + `name` must be unique (header names are case-insensitive), and so must `sourceIdentifier`.
- **Endpoints:** `path` is the protocol/native operation path; set an operation `endpointUrl` when you know the full resolved URL. Clients must **not** build URLs by concatenating the contract `endpointUrl` and a `path`: only a protocol-aware adapter may combine them. The UI shows both and never composes a URL.
- **Bodies:** scalar invocation parameters belong in `parameters`; the field-level structure of request/response bodies belongs in the same distribution's [`data-dictionary`](./data-dictionary.md), referenced by entity id from `request.dictionaryEntity` / `response.dictionaryEntity`. The How to use section links those references to the entity in Structure.
- **Response paths:** `response.recordsPath` and the pagination `nextCursorPath`, `nextLinkPath` and `totalPath` are [RFC 6901 JSON Pointers](https://www.rfc-editor.org/rfc/rfc6901) into the JSON response (`/occurrences`, `/paging/nextCursor`; `""` is the whole response). For OGC API / STAC style `links` arrays, use `nextLinkRelation` (e.g. `"next"`) instead of a pointer.
- **Pagination parameters:** `limitParameter`, `offsetParameter`, `pageParameter` and `cursorParameter` name a `query` parameter of the same operation.

## Provenance and review state

Provenance works exactly as in the [Data Dictionary](./data-dictionary.md#provenance-and-review-state) and uses the same helpers. It is inherited, **nearest wins** (no merging):

1. `propertyProvenance[<property>]` on the node (for a single property, e.g. an operation's `purpose` or a parameter's `description`);
2. the node's own `provenance` (parameter → operation);
3. the contract-level `provenance`.

`method` is one of `authoritative-import`, `harvested`, `manual`, `agent-generated`, `inferred` (open vocabulary); `reviewStatus` is one of `unreviewed`, `reviewed`, `custodian-approved`, `rejected`. Every provenance object must state `method` and/or `reviewStatus`, so an empty or detail-only object can't hide inherited (possibly protected) provenance.

Use property-level provenance for mixed-origin metadata, e.g. a harvested operation with a custodian-written purpose:

```json
{
  "id": "list-sites",
  "sourceIdentifier": "listSites",
  "method": "GET",
  "path": "/sites",
  "purpose": "Browse every monitoring site; start here to find site codes",
  "propertyProvenance": {
    "purpose": { "method": "manual", "reviewStatus": "custodian-approved" }
  }
}
```

Record what the contract was built from and when it was checked:

- `specification.url`, `version`, `fingerprint` (e.g. `sha256:<hex>`) and `retrievedAt`;
- `provenance.generator`, `generatedAt`, `sourceType` and `sourceFingerprint` (also on reviewed nodes, to show which source version a review applies to);
- `lastVerified`: when the endpoint/interface was last checked successfully. It is not a guarantee of availability.

Rules for anything that writes the aspect, including future automatic producers and agents:

- Keep operation `id`s and parameter identities stable; prefer native `sourceIdentifier`s.
- Metadata whose effective provenance is `method: "manual"` or `reviewStatus: "reviewed" | "custodian-approved"` is **protected** (`isProtectedProvenance()`): do not overwrite it automatically. Refresh only unprotected, source-derived properties.
- When a source change can't be applied safely, keep the protected value rather than silently replacing it. How such conflicts are recorded and surfaced for review is defined by the first automatic producer ([#3814](https://github.com/magda-io/magda/issues/3814)).
- Mark agent-written content `method: "agent-generated"`; it is shown as advisory until reviewed.

## Populating a contract with `mgd`

The generic aspect commands work on distribution records; no contract-specific command is needed:

```sh
# create or replace the whole contract
mgd dataset aspect set <distribution-id> distribution-contract @distribution-contract.json

# read it back (machine-readable)
mgd dataset aspect get <distribution-id> distribution-contract --json
```

`mgd dataset aspect patch` performs a server-side JSON merge. Objects are merged key by key, but arrays are **combined, not matched by `id`**: patching `operations` or `parameters` appends changed elements alongside the old ones and produces duplicates (which `validateDistributionContract()` reports). Use `patch` only for top-level objects such as `provenance`, `specification` or `authentication`:

```sh
mgd dataset aspect patch <distribution-id> distribution-contract '{"lastVerified":"2026-10-03T00:00:00Z"}'
```

For a targeted edit inside `operations` (e.g. one operation's purpose) send an RFC 6902 JSON Patch to the registry instead, addressing the element by index (read the aspect first to find it):

```sh
cat > patch.json <<'EOF'
[
    { "op": "add", "path": "/operations/0/purpose", "value": "Browse every monitoring site; start here to find site codes" },
    { "op": "add", "path": "/operations/0/propertyProvenance", "value": { "purpose": { "method": "manual", "reviewStatus": "custodian-approved" } } }
]
EOF
mgd api request PATCH /v0/registry/records/<distribution-id>/aspects/distribution-contract --body-file patch.json
```

The registry validates aspect data against the JSON schema only when its `validateJsonSchema` option is enabled (the normal Helm deployment enables it; local/custom deployments may not), so validate before writing.

No protocol-specific `mgd` execution command is implied by this authoring path: the contract describes how to call a source, and `mgd` only reads and writes the metadata.

## Validating and consuming programmatically

```ts
import { validateDistributionContract } from "@magda/typescript-common/dist/distribution-contract/validate.js";
import { normalizeDistributionContract } from "@magda/typescript-common/dist/distribution-contract/normalize.js";
import {
  getEffectiveAuthentication,
  getParameterIdentity
} from "@magda/typescript-common/dist/distribution-contract/contract.js";
import {
  getEffectiveProvenance,
  isAdvisoryProvenance,
  isProtectedProvenance
} from "@magda/typescript-common/dist/distribution-contract/provenance.js";
```

- Validate the payload against `distribution-contract.schema.json` (any draft-07 validator), then call `validateDistributionContract(contract, dataDictionary?)` for the rules a JSON Schema cannot express. It returns `[]` when no issue is found, otherwise issues with a JSON Pointer `location`. It reports:
  - errors for duplicate operation `id`s/`sourceIdentifier`s, duplicate parameters (`location` + `name`, or `sourceIdentifier`), credential-bearing parameters, pagination parameters that aren't `query` parameters of the operation, invalid JSON Pointers, and (when the distribution's `data-dictionary` is passed as the second argument) `dictionaryEntity` references to entities it doesn't contain;
  - warnings for parameters whose name looks like a credential (e.g. `api_key`, `password`).
- `normalizeDistributionContract()` defensively converts unvalidated registry data into a safe, typed value (the web client uses it):
  - It fails closed, returning `undefined`, unless `schemaVersion` is a supported `1.x` version, so a future major version is never read with v1 semantics.
  - Values of the wrong type anywhere in the documented structure are dropped. Parameter `default`, `example` and `enum`, and additional `sourceCapabilities`, accept any JSON value and are kept as-is.
  - It never invents identities: operations without an `id`, and parameters without a `name` and `location`, are skipped.
  - It never exposes credential inputs as parameters: `Authorization` / `Proxy-Authorization` header parameters and parameters matching the operation's effective `authentication` (`location` + `name`) are dropped. Authentication objects without a `type` are dropped so they can't mask the contract-level one, and only the documented descriptive `authentication` properties are kept.
  - Provenance objects stating neither `method` nor `reviewStatus` are dropped, so they can't mask inherited provenance.
  - Undocumented extension properties are not carried over (except in `sourceCapabilities`); read the raw aspect for those.
- `getEffectiveProvenance(contract, [operation, parameter], "description")` resolves inherited / property-level provenance; `getEffectiveAuthentication(contract, operation)` returns the operation's authentication override or the contract default.

Machine clients and agents should derive tool descriptions from the **normalized** contract, not raw aspect JSON: the distribution id + operation `id` give a stable tool identity, and `interactionType`, `parameters` (with `getParameterIdentity()`), request/response entities (resolved through the `data-dictionary`), `recordsPath` and pagination hints describe the call deterministically. Executing a call still requires an approved adapter that resolves the endpoint, credentials (through a delegated-auth system, never from this aspect), network policy and request/response limits.
