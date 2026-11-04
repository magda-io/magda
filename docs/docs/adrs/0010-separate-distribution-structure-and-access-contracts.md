# ADR 0010: Separate distribution structure from access mechanics

- **Status:** Accepted; v7 core implemented in #3820 and #3828
- **Date:** 2026-11-04 (documented retrospectively)
- **Related:** [Data Understanding epic #3806](https://github.com/magda-io/magda/issues/3806), [Data Dictionary #3820](https://github.com/magda-io/magda/pull/3820), [Distribution Contract #3828](https://github.com/magda-io/magda/pull/3828)

## Context

MAGDA distributions may be files, relational tables, ArcGIS/OGC services, REST endpoints or scientific arrays. Data structure and access/query mechanics are related but **not the same concern**. A single dataset can have multiple distributions exposing different access protocols and different representations. Existing catalogue descriptions and specialised preview plugins do not provide a reliable normalized interface for machines and humans.

## Decision

Use two optional, additive, distribution-level Registry aspects:

- **`data-dictionary`**: what information the distribution contains — entities, field paths, types, units, keys, relationships, dimensional information and provenance. It is a **compact logical projection**, not a replacement for the native schema.
- **`distribution-contract`**: how the distribution can be located, queried or downloaded — protocol, endpoint/specification references, documented authentication requirements, operations, parameters, response references, pagination and provenance. The contract is **descriptive metadata**, not an executable grant to invoke the remote service.

Retain dataset-level descriptions, coverage, provenance and linked methodology in existing dataset aspects. Keep the native source/schema authoritative rather than attempting to reproduce every native service or schema feature losslessly. Display Structure and How to use below distribution previews, **without** requiring a preview to render the metadata.

## Consequences

- Both aspects can be authored, versioned, validated and consumed independently; a query-only or unpreviewable resource can still be understood.
- Each aspect has its own built-in Registry JSON Schema, typed model/validator, compatibility fixtures and read-only web section.
- Cross-references (for example operation request/response `dictionaryEntity` IDs) can connect access and structure **within the same distribution**.
- No authorization is granted by descriptive metadata. Actual endpoint access and safe actions remain subject to MAGDA permissions, external service authentication, user approval and other runtime policies.
- Producers and harvesters can be introduced incrementally later. Automatic data-dictionary and distribution-contract producers are **not** part of the accepted implemented core (open #3813 and #3814).

## Alternatives considered

A single combined aspect, storing metadata only at dataset level, requiring a preview plugin for structure/access information, and adopting one native standard (OpenAPI/JSON Schema/CSVW/OGC) as the universal schema were rejected due to poor separation of concerns and incomplete coverage across sources.

## References and verification

[Data Dictionary guide](../data-dictionary.md) and [Distribution Contract guide](../distribution-contract.md) describe implemented behaviour. The executable contracts are `magda-registry-aspects/{data-dictionary,distribution-contract}.schema.json` and the typed/fixture tests. Full implementation-era design history is retained at [Data Dictionary design](../../design/data-dictionary-design.md) and [Distribution Contract design](../../design/distribution-contract-design.md).
