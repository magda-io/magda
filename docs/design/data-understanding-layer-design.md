# Data Understanding Layer Design

## Status

Magda v7 core design. The core normalized distribution metadata is implemented by #3807 / #3820 (`data-dictionary`) and #3808 / #3828 (`distribution-contract`). The Magda v8 AI Agent Platform (#3810) is developed on `next` and is a downstream consumer of these v7 capabilities.

This document defines the overall architecture and user experience for helping people and machine clients understand what a dataset contains, how its distributions can be accessed, and how existing dataset-level catalogue metadata contributes context. Detailed core contracts are defined in:

- [`distribution-contract-design.md`](./distribution-contract-design.md)
- [`data-dictionary-design.md`](./data-dictionary-design.md)

The former `dataset-usage` proposal is retained as a **deferred, use-case-driven extension** rather than a required part of the v7 core. See [`dataset-usage-design.md`](./dataset-usage-design.md).

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

1. **What is this dataset about, and what dataset-level context already exists?**
2. **What information or fields does each distribution contain?**
3. **How can a distribution be accessed or queried?**
4. **What relevant constraints, coverage and provenance information is available?**
5. **How could it potentially combine with other datasets?**

Dataset-level analytical fitness remains a domain judgement. General context belongs in existing dataset description/coverage/source metadata; a future structured fitness extension should be introduced only when a concrete authoritative use case requires machine-readable claims.

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

The v7 core uses two normalized distribution-level contracts, complemented by Magda's existing dataset-level metadata:

| Layer | Scope | Primary question |
| --- | --- | --- |
| existing dataset metadata | Dataset | What is this dataset about, and what spatial/temporal/source context is known? |
| `distribution-contract` | Distribution | How can I access or query this representation? |
| `data-dictionary` | Distribution | What information does this representation contain? |

The same dataset can have multiple distributions with different interfaces and schemas, so structure/access contracts belong at distribution level. Dataset description, spatial/temporal coverage, provenance/source metadata, themes and keywords remain the default home for dataset-level context.

A future `dataset-usage` extension may add authoritative, purpose-specific fitness or non-inference claims, but it is not a required third core layer. See [Dataset Usage / Fitness-for-Use Extension Design](./dataset-usage-design.md).

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

### 7. Align with established schema standards without adopting one universal schema language

No single existing standard covers all target sources. The normalized aspects should reuse/mirror mature concepts where practical:

- JSON Schema for generic structural/type/constraint concepts;
- CSVW and Frictionless Table Schema/Data Package for tabular metadata and explicit relationships;
- OGC API schema conventions for geospatial roles, units, codelists and references;
- Arrow/Parquet for columnar logical types;
- CF/netCDF/Zarr for multidimensional variables, dimensions and coordinates.

Magda remains a mediation layer: native specifications stay authoritative and the normalized aspects expose the common subset needed by people and software agents.

## Architecture

```text
External source / native specification
        |
        | crawl, connector, minion, agent-assisted authoring or manual authoring
        v
+----------------------------------+
| Magda metadata                   |
|                                  |
| existing dataset metadata        |
| distribution-contract            |
| data-dictionary                  |
|                                  |
| optional future: dataset-usage   |
+----------------------------------+
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

The two core aspect contracts, typed client access and read-only UI must also be useful **without automatic harvesting**. A deployment/project may initially populate them manually through Registry APIs, `mgd`, project tooling or an agent, then add automatic producers incrementally.

## Registry model

The v7 core aspect IDs are:

- `distribution-contract` on distribution records;
- `data-dictionary` on distribution records.

Dataset-level context continues to use existing catalogue aspects such as `dcat-dataset-strings`, `spatial-coverage`, `temporal-coverage`, provenance/source metadata, themes and keywords.

The core aspect JSON Schemas are shipped as built-in schemas in `magda-registry-aspects` so they are available to connectors, minions, `mgd`, the web client and external consumers in the same way as other first-party Magda aspects.

The web client should use explicit typed access to the two normalized contracts rather than depending on ad-hoc reads from `rawData` in view components.

Each core aspect payload carries its own schema version and provenance/review metadata where appropriate. Consumers must ignore unknown additive fields so a v7.x deployment can extend the contracts without coordinated upgrades of every reader.

If a future `dataset-usage` aspect is introduced, it should follow the same built-in/typed/provenance conventions only after the revisit criteria in its design are met.

## User experience

The dataset/distribution pages should evolve from a preview-first presentation to a consistent explanation-first presentation.

A target distribution experience is:

1. **About this data** — title, description, spatial/temporal coverage, source/provenance and other existing dataset-level context.
2. **Structure** — normalised data dictionary.
3. **How to use** — distribution contract, operations, parameters and native documentation/specification links.
4. **Example** — bounded sample rows, response example or safe query result when available.
5. **Access & limitations** — access notes, descriptive source constraints, provenance and review status.
6. **Preview** — map/table/chart/plugin visualisation where a compatible renderer exists.

The exact visual layout can evolve, but the information architecture should not require a preview to make sections 1-5 useful.

The numbered list describes the information architecture, not the on-page order for distributions that already have a preview. See [Placement relative to existing previews](#placement-relative-to-existing-previews).

### Placement relative to existing previews

New Data Understanding sections (Structure, How to use, and later sections) are **added below the existing preview** on the distribution page rather than inserted above it:

- **Distributions with a preview keep the layout people already know.** The map/table/chart preview stays where users expect it, and the new sections appear underneath.
- **Long metadata doesn't bury the preview.** A data dictionary with dozens of fields, or a contract with many operations, would otherwise push the preview far down the page.
- **Distributions without a preview are unaffected.** The new sections are rendered outside the preview gate, so for a query-only, restricted or otherwise non-previewable distribution they appear straight after the source/access information. Those distributions still get the explanation-first experience.

On the distribution page, the Data Understanding sections are presented as **tabs** in one panel (Structure, How to use, and later sections in information-architecture order), so users can switch between them without scrolling:

- the tab bar is shown whenever at least one section is available, even for a single tab: the tab label names the section, replacing a visible section heading (headings are kept for screen readers and print);
- the first available tab (Structure) is selected by default; the URL hash (`#structure`, `#how-to-use`) selects and links to a tab, without adding a browser-history entry;
- panels keep their state while hidden (e.g. a field search), and a link from one section to another (e.g. a How to use response entity to its Structure entity) switches tabs;
- the panel as a whole follows the placement rule above: below the previews, outside the preview gate.

The same additive principle applies to other pages, such as the dataset page's Using this dataset section: new sections should extend the page without displacing content users already rely on, unless a later UX review deliberately changes the layout.

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

### Core aspect implementation convention established by Data Dictionary

The completed v7 Data Dictionary core (#3807 / #3820) established a reusable implementation pattern that was then applied to Distribution Contract (#3808 / #3828) and should be reused by any future first-party Data Understanding aspect:

- draft-07 built-in schema + published representative fixtures;
- compatible `1.x` versioning with fail-closed handling for unsupported major versions;
- shared typed model, defensive normalizer and semantic/cross-reference validator;
- no invented stable identities during defensive normalization;
- provenance inheritance/protection with property-level overrides for mixed-origin metadata;
- schema/runtime agreement for provenance semantics;
- typed parsed-record access rather than view-layer `rawData` reads;
- Data Understanding UI sections below previews and outside preview gates;
- whole-aspect `mgd ... aspect set|get` authoring, with RFC 6902 JSON Patch rather than merge-patch for targeted edits inside arrays.

#3808 / #3828 already follows this pattern. A future `dataset-usage` implementation should reuse it where applicable rather than independently rediscovering these conventions.

## Metadata production paths

The same aspects may be populated through multiple paths.

### Core-first delivery

The first usable v7 milestone should establish the built-in aspect contracts, typed client/model support and read-only UI independently of source-specific automation. Manual/custodian authoring is a first-class production path, not merely a temporary fallback.

Automatic producers can then be added incrementally according to project/source needs. Complete CSV/Excel/OpenAPI/ArcGIS/OGC/NetCDF coverage is not a prerequisite for the normalized contracts to be useful to people, `mgd` or agents.

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

Magda already uses connectors to transform external metadata into aspects and minions to enrich records. Automatic data-understanding producers should follow those patterns rather than placing protocol-specific crawling logic in the React web client.

Preferred production patterns are:

- **minion-style enrichment** for post-ingestion inspection/inference of existing distributions, such as bounded CSV/Excel inspection;
- **connector-native generation** when a connector already has authoritative schema/service metadata available while harvesting;
- project/domain-specific producers where deployments need specialised formats or protocols.

A source-specific producer may emit more than one normalized aspect in a single pass. For example, an OpenAPI or ArcGIS adapter may populate both `distribution-contract` and `data-dictionary` rather than fetching/parsing the same source twice.

Shared normalization, validation and merge helpers may live in the main Magda repository, while source-specific producers remain independently evolvable.

### Web client

`DistributionDetails.tsx` currently presents source/access information and then mounts `DataPreviewVis`, `DataPreviewMap` and plugin visualisation sections. The new renderer should sit alongside those components and work even when the distribution is not previewable.

The current preview block is gated by `distribution.downloadURL || distribution.accessURL`. The new `data-dictionary` and `distribution-contract` sections must **not** be placed inside that gate: query-only/restricted/service distributions may have useful Data Understanding metadata even when the existing preview path cannot run. They are rendered after the preview block (including plugin visualisation sections), as described in [Placement relative to existing previews](#placement-relative-to-existing-previews).

### Implementation map for the v7 core

The following current code paths define the v7 core and should be treated as part of the core contracts rather than source-specific producer work:

- **Built-in aspect definitions:** `data-dictionary.schema.json` and `distribution-contract.schema.json` live under `magda-registry-aspects/`. `magda-migrator-registry-aspects` discovers built-in definitions automatically from `*.schema.json`, so no separate hard-coded registration list is required. Keep `magda-registry-aspects/README.md` in sync.
- **Web-client record fetches:** `magda-web-client/src/api-clients/RegistryApis.ts` explicitly fetches `data-dictionary` and `distribution-contract` for distributions.
- **Typed record model:** the raw/parsed record model and parsing path in `magda-web-client/src/helpers/record.ts` expose the normalized contracts through shared Data Understanding types. UI code consumes typed parsed properties rather than arbitrary `rawData` reads.
- **Distribution UI:** Structure/Data Dictionary and How to use render from `magda-web-client/src/Components/Dataset/View/DistributionDetails.tsx` or dedicated child components, independently of preview availability, after the existing preview block (see [Placement relative to existing previews](#placement-relative-to-existing-previews)).
- **Manual authoring:** existing `mgd dataset aspect get|set|patch` commands work with any record, including distribution records. The core v7 capability does not require new aspect-specific `mgd` commands.
- **Tests:** cover absence of the optional core aspects, representative valid payloads, typed parsing and UI rendering. Existing datasets/distributions without the aspects must remain unchanged.

There is no v7-core requirement to add a `dataset-usage` schema, fetch path, typed model or dataset-page UI. Those become implementation work only if the deferred extension is reactivated from a concrete use case.

### Preview plugins

Existing preview systems remain useful. They consume the same distribution but are not made responsible for explaining generic structure, provenance or API usage.

### Search and semantic indexing

A later phase may index selected human-readable portions of existing dataset description/coverage metadata, `distribution-contract` and `data-dictionary` so users can search for concepts such as fields and supported operations. Large raw aspect payloads should not be indiscriminately copied into search documents.

If a future `dataset-usage` extension is implemented, selected authoritative fitness/limitation claims may also be indexed, but ranking must take provenance/review state into account.

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

The recommended implementation sequence is now:

1. **complete** `data-dictionary` core (#3807 / #3820);
2. **complete** `distribution-contract` core (#3808 / #3828);
3. add automatic source-specific producers incrementally through minions/connectors as needs arise; one producer may populate both dictionary and contract where appropriate;
4. add bounded API/service examples and query exploration with explicit safety policy;
5. add semantic indexing/search integration for selected existing dataset metadata and normalized contract fields;
6. expand machine consumption for agents and future query adapters;
7. revisit `dataset-usage` only when a concrete authoritative fitness/limitation use case meets the criteria in its deferred design.

This sequence keeps the v7 core useful without coupling it to complete automatic source coverage or to a speculative dataset-level fitness model. The v8 Agent Platform (#3810) can consume existing dataset metadata plus manually or automatically populated distribution contracts as they become available.

## Safety and trust boundaries

- Never store credentials or secret material in these aspects.
- Never interpret descriptive `authentication` metadata as proof that a caller is authorised.
- Query exploration must be bounded and restricted to explicitly supported safe operations.
- Generated metadata must expose provenance and review state.
- Manual/custodian-reviewed metadata is first-class and automatic producers must not silently overwrite it.
- Property-level provenance should be available where mixed-origin metadata is expected so a producer can refresh source-derived structure while preserving reviewed descriptive/semantic properties.
- Sampling must be bounded by row/byte/time limits and respect existing Magda/source access controls.
- A source specification URL is not automatically trusted content; harvesters must apply normal network/security controls.

## Compatibility

The feature is additive. Existing datasets and distributions without these aspects continue to render using current behaviour.

The web client should render each section only when the relevant aspect is available. Existing preview-map and tabular preview behaviour remains intact.

## Acceptance criteria for the overall capability

- A distribution can be useful and understandable in the UI even when no specialised preview is available.
- Existing dataset metadata, `data-dictionary` and `distribution-contract` have clear, non-overlapping responsibilities.
- Native specifications remain the source of truth when available.
- Authoritative, inferred and agent-generated metadata are visibly distinguishable.
- Existing Magda access-control semantics are not weakened or duplicated as authority.
- At least CSV/Excel, REST/OpenAPI and ArcGIS sources can be represented through the common model.
- The core aspect payloads are directly consumable by non-UI clients such as `mgd`, agents and future query adapters.
- Existing catalogue records without the new aspects remain backward compatible.
