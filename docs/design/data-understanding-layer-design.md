# Data Understanding Layer Design

## Status

Proposed design for a future Magda v7 capability.

This document defines the overall architecture and user experience for helping people and machine clients understand what a dataset can tell them, what it contains, how it can be accessed, and how it may participate in broader analysis. Detailed contracts are defined in the companion designs:

- [`distribution-contract-design.md`](./distribution-contract-design.md)
- [`data-dictionary-design.md`](./data-dictionary-design.md)
- [`dataset-usage-design.md`](./dataset-usage-design.md)

## Problem

Magda's current dataset and distribution pages are strongest when a distribution can be previewed directly. The distribution page renders source/access information and then delegates understanding largely to specialised preview components such as tabular visualisation and map preview.

That model works well for some resources, but it does not generalise to the full range of data that a catalogue may contain:

- a REST API may be better understood through its operations, parameters, response structure and examples than through a visualisation;
- an ArcGIS Feature Service may expose useful schema and query capabilities even when the current map preview cannot render it;
- a NetCDF resource may be understandable through variables, dimensions, coordinates, units and attributes without a generic plot;
- a CSV or Excel file may be valuable because of its columns and semantics even when no chart is appropriate;
- a restricted or query-only service may be useful to a researcher even when the portal cannot download or render the underlying records.

A universal visualisation layer is therefore neither necessary nor realistic. Magda needs a more general **data understanding layer** that can explain a resource independently of whether a specialised preview exists.

## Goal

Enable a researcher, analyst, developer or software agent to answer the following questions from Magda metadata:

1. **Why is this dataset useful?**
2. **What can it establish, and what can it not establish?**
3. **What information or fields does it contain?**
4. **How can this distribution be accessed or queried?**
5. **What are the relevant constraints and caveats?**
6. **How could it potentially combine with other datasets?**

The same machine-readable metadata should support both human-facing catalogue UX and future machine use such as agent tools, federated query adapters, validation and schema-drift detection.

## Non-goals

This design does not:

- define a universal data visualisation framework;
- replace Magda's existing access-control or authorisation model;
- store credentials, tokens or secrets in catalogue metadata;
- copy complete OpenAPI, ArcGIS, OGC, STAC or other native service specifications into registry aspects;
- claim that automatically inferred metadata is equivalent to custodian-provided metadata;
- define a production federated query gateway;
- define automatic joins between arbitrary datasets;
- require every distribution to have all proposed metadata before it can be published.

## Design principles

### 1. Explain before visualising

A useful catalogue entry should remain understandable even if no map, table or chart renderer exists. Visualisation remains a valuable progressive enhancement, not the primary data-understanding contract.

### 2. Keep the layers separate

The design uses three complementary metadata concepts:

| Layer | Scope | Primary question |
| --- | --- | --- |
| `dataset-usage` | Dataset | Why would I use this, and what are its limitations? |
| `distribution-contract` | Distribution | How can I access or query this representation? |
| `data-dictionary` | Distribution | What information does this representation contain? |

The concepts are separate because the same dataset can have multiple distributions with different interfaces and schemas, while fitness-for-use claims often apply to the dataset as a whole.

### 3. Preserve native specifications as authorities

When a source already exposes a machine-readable contract, Magda should reference it and normalise the subset required for discovery and interaction.

Examples include:

- OpenAPI / JSON Schema;
- ArcGIS REST service and layer definitions;
- OGC API metadata and schemas;
- STAC collections/items schemas;
- Frictionless Table Schema;
- NetCDF/CF metadata.

Magda should not become a competing full specification language for those ecosystems.

### 4. Provenance is part of the meaning

Every generated or imported description must make its origin clear. A field definition supplied by a custodian is materially different from a type inferred from five sampled rows.

Consumers must be able to distinguish, at minimum:

- authoritative source metadata;
- custodian-authored metadata;
- harvested metadata derived deterministically from a source definition;
- inferred metadata derived from sampled data;
- agent-generated metadata;
- reviewed versus unreviewed metadata.

### 5. Descriptive metadata is not access authority

The data-understanding layer may describe authentication mechanisms, access modes and source-side limitations, but existing Magda access/access-control policy remains authoritative for catalogue access. A future query gateway may have its own execution policy.

### 6. Normalise semantics without requiring full standardisation

The design should make heterogeneous sources easier to compare without forcing all custodians into one source schema. Normalised field descriptions, semantic concept identifiers, units and stable paths provide a standards-lite mediation layer.

## Architecture

```text
External source / native specification
        |
        | crawl, connector, minion, agent-assisted authoring or manual authoring
        v
+---------------------------+
| Normalised Magda metadata |
|                           |
| dataset-usage             |
| distribution-contract     |
| data-dictionary           |
+---------------------------+
        |
        +---------------------+----------------------+-------------------+
        |                     |                      |                   |
        v                     v                      v                   v
Dataset/distribution     Search / semantic      LLM / agent        Future federated
page UX                  indexing               consumption        query adapters
        |
        v
Optional specialised previews
(map / table / chart / other plugins)
```

Harvesting is intentionally decoupled from rendering. A source adapter can populate normalised metadata even when the web client has no specialised preview implementation for that source type.

## Registry model

The proposed aspect IDs are:

- `dataset-usage` on dataset records;
- `distribution-contract` on distribution records;
- `data-dictionary` on distribution records.

The aspect JSON Schemas should be shipped as built-in schemas in `magda-registry-aspects` so they are available to connectors, minions, `mgd`, the web client and external consumers in the same way as other first-party Magda aspects.

The web client should add explicit typed access to these aspects rather than depending on ad-hoc reads from `rawData` in view components.

Each aspect payload should carry its own schema version and provenance/review metadata where appropriate. Consumers must ignore unknown additive fields so a v7.x deployment can extend the contracts without coordinated upgrades of every reader.

## User experience

The dataset/distribution pages should evolve from a preview-first presentation to a consistent explanation-first presentation.

A target distribution experience is:

1. **About this data** — title, description and dataset-level usage/fitness guidance.
2. **Structure** — normalised data dictionary.
3. **How to use** — distribution contract, operations, parameters and native documentation/specification links.
4. **Example** — bounded sample rows, response example or safe query result when available.
5. **Access & limitations** — access notes, descriptive source constraints, provenance and review status.
6. **Preview** — map/table/chart/plugin visualisation where a compatible renderer exists.

The exact visual layout can evolve, but the information architecture should not require a preview to make sections 1-5 useful.

### Progressive enhancement examples

#### CSV / Excel

- Structure: columns, inferred/provided types, units, descriptions and constraints.
- Example: bounded sample rows.
- Preview: existing table/chart components where suitable.

#### REST API

- Structure: response entity/fields and request-body entities where applicable.
- How to use: operations, path/query/header parameters, authentication description and specification link.
- Example: bounded safe request/response exploration.
- Preview: not required.

#### ArcGIS Feature Service

- Structure: layer fields, geometry metadata and units/domains where available.
- How to use: service/layer endpoint and query capability summary.
- Example: bounded feature query.
- Preview: map when supported.

#### NetCDF

- Structure: dimensions, coordinates, variables, units and attributes.
- How to use: download/access mechanism.
- Example: metadata summary; bounded extraction may be added later.
- Preview: optional specialised visualiser.

## Metadata production paths

The same aspects may be populated through multiple paths.

### Authoritative import

A connector or harvester reads a native specification and produces normalised metadata. Examples: OpenAPI, ArcGIS layer JSON, JSON Schema or Frictionless Table Schema.

### Deterministic inspection

A component reads file metadata or a bounded portion of a file and derives structure. Examples: CSV headers and types or NetCDF variable metadata.

### Agent-assisted generation

An agent may inspect a resource or documentation and propose descriptions, semantic mappings or usage notes. Agent-generated content must be marked as such and must not silently replace authoritative metadata.

### Manual authoring/review

Custodians or catalogue editors can correct or approve generated metadata. The design must preserve review state rather than flattening reviewed and unreviewed content into an indistinguishable result.

## Relationship to current Magda components

### Registry aspects

`magda-registry-aspects` is the source of built-in JSON Schemas. The new aspect schemas belong there.

### Minions/connectors

Magda already uses connectors to transform external metadata into aspects and minions to enrich records. Schema harvesters should follow those patterns rather than placing protocol-specific crawling logic in the React web client.

### Web client

`DistributionDetails.tsx` currently presents source/access information and then mounts `DataPreviewVis`, `DataPreviewMap` and plugin visualisation sections. The new renderer should sit alongside those components and work even when the distribution is not previewable.

### Preview plugins

Existing preview systems remain useful. They consume the same distribution but are not made responsible for explaining generic structure, provenance or API usage.

### Search and semantic indexing

A later phase may index selected human-readable portions of `dataset-usage`, `distribution-contract` and `data-dictionary` so users can search for concepts such as fields, supported operations and suitability. Large raw aspect payloads should not be indiscriminately copied into search documents.

## Cross-dataset interoperability

The first release should not attempt automatic federation planning. It should, however, record enough semantics to enable later mediation.

Useful building blocks include:

- stable field paths;
- human-readable descriptions;
- units;
- semantic concept URIs/identifiers;
- geometry and coordinate semantics;
- identifiers and key-like fields;
- temporal meaning and granularity;
- provenance and authority.

A future service or agent can use these signals to propose relationships such as:

- same semantic concept under different field names;
- compatible units after conversion;
- spatial intersection;
- temporal alignment;
- identifier-based joins.

Any such relationship should remain a proposal unless backed by explicit mappings or validated rules.

## Delivery sequence

The recommended implementation sequence is:

1. add the three built-in aspect schemas and typed client/model support;
2. render `data-dictionary` in the distribution page;
3. add dictionary harvesting for high-value source types, starting with CSV/Excel, OpenAPI/JSON Schema and ArcGIS;
4. render `distribution-contract` and add a read-only "How to use" experience;
5. add bounded API/service examples and query exploration with explicit safety policy;
6. render and author `dataset-usage`, including provenance/review state;
7. add semantic indexing/search integration for selected fields;
8. add machine consumption for agents and future query adapters.

This sequence delivers useful catalogue understanding before requiring a federated query gateway.

## Safety and trust boundaries

- Never store credentials or secret material in these aspects.
- Never interpret descriptive `authentication` metadata as proof that a caller is authorised.
- Query exploration must be bounded and restricted to explicitly supported safe operations.
- Generated metadata must expose provenance and review state.
- Sampling must be bounded by row/byte/time limits and respect existing Magda/source access controls.
- A source specification URL is not automatically trusted content; harvesters must apply normal network/security controls.

## Compatibility

The feature is additive. Existing datasets and distributions without these aspects continue to render using current behaviour.

The web client should render each section only when the relevant aspect is available. Existing preview-map and tabular preview behaviour remains intact.

## Acceptance criteria for the overall capability

- A distribution can be useful and understandable in the UI even when no specialised preview is available.
- The three metadata concepts have clear, non-overlapping responsibilities.
- Native specifications remain the source of truth when available.
- Authoritative, inferred and agent-generated metadata are visibly distinguishable.
- Existing Magda access-control semantics are not weakened or duplicated as authority.
- At least CSV/Excel, REST/OpenAPI and ArcGIS sources can be represented through the common model.
- The aspect payloads are directly consumable by non-UI clients such as `mgd`, agents and future query adapters.
- Existing catalogue records without the new aspects remain backward compatible.
