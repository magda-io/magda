# Dataset Usage and Fitness-for-Use Design

## Status

Proposed design for a future Magda v7 capability.

This document defines the dataset-level `dataset-usage` aspect introduced by the [data understanding layer](./data-understanding-layer-design.md).

## Purpose

Knowing that a dataset contains certain fields or can be queried through an API does not answer the most important research question:

> Is this dataset appropriate evidence for the question I am trying to answer?

A researcher needs to understand what a dataset is useful for, what it can reasonably establish, what it cannot establish, and which methodological or coverage limitations matter before combining it with other data.

The `dataset-usage` aspect provides structured, provenance-aware guidance for that purpose.

It complements:

- `data-dictionary`, which explains what information a distribution contains;
- `distribution-contract`, which explains how a distribution can be accessed or queried.

## Goals

The aspect should make it possible to communicate:

- intended and demonstrated uses;
- fitness-for-use assessments for particular analytical purposes;
- important limitations and non-inferences;
- interpretation guidance;
- methodology references;
- spatial, temporal and entity-level granularity/currency considerations;
- quality considerations that materially affect interpretation;
- evidence and provenance behind those statements;
- review/custodian approval state.

The aspect should be useful both to people and to software agents deciding whether a dataset is appropriate for a task.

## Non-goals

The aspect does not:

- certify scientific validity in general;
- replace domain peer review;
- guarantee that a dataset is suitable for every use not explicitly discussed;
- replace generic dataset description, spatial coverage, temporal coverage or provenance aspects;
- encode distribution-specific API parameters or schemas;
- permit an agent-generated limitation statement to masquerade as custodian-approved guidance;
- automatically determine causal or legal conclusions from data.

## Why this is dataset-level

Fitness-for-use usually concerns the meaning and production of the dataset rather than a particular transport format.

For example, the same orchard-mapping dataset may be available as a Feature Service and a downloadable file. The limitations of the mapping method apply to both distributions even though access mechanisms differ.

Distribution-specific caveats can still live in `distribution-contract` or ordinary access notes where appropriate.

## Aspect ID and placement

Aspect ID:

```text
dataset-usage
```

Record type:

```text
dataset
```

Built-in JSON Schema location:

```text
magda-registry-aspects/dataset-usage.schema.json
```

## Design principles

### 1. Phrase claims in terms of evidence, not marketing

The aspect should prefer statements such as:

> Suitable for regional estimates of mapped commercial citrus area for the stated mapping period.

rather than:

> High-quality dataset for citrus research.

The former is testable and scoped; the latter is not.

### 2. Explicitly represent non-inferences

A high-value part of the metadata is often what the data **cannot establish**.

Example:

> Mapped presence should not be interpreted as confirmation that a specific property is currently producing citrus.

This prevents a map or field name from implying stronger evidence than the source supports.

### 3. Preserve authorship and review state

Custodian-authored guidance, peer-reviewed methodology and agent-generated suggestions must remain distinguishable.

### 4. Avoid duplicating base catalogue metadata

Spatial and temporal extents already have dedicated Magda aspects. `dataset-usage` should explain why their granularity/currency matters for interpretation rather than restating every bounding box/date.

## Proposed v1 shape

```json
{
  "schemaVersion": "1.0",
  "summary": "Mapped tree-crop extent suitable for regional production-landscape analysis.",
  "intendedUses": [
    {
      "purpose": "Estimate the regional distribution of mapped tree-crop commodities",
      "description": "Useful for landscape-scale exposure and proximity analyses."
    }
  ],
  "fitnessAssessments": [
    {
      "purpose": "Identify current citrus production at an individual property",
      "assessment": "not-suitable",
      "rationale": "Mapping currency and classification methodology do not establish current production status at property level.",
      "evidence": [
        {
          "type": "methodology",
          "url": "https://example.org/methodology"
        }
      ]
    },
    {
      "purpose": "Estimate regional citrus exposure around a detection location",
      "assessment": "conditionally-suitable",
      "rationale": "Suitable when the analysis tolerates the published mapping currency and spatial resolution.",
      "conditions": [
        "Report the source mapping year",
        "Do not interpret unmapped parcels as proof of absence"
      ]
    }
  ],
  "limitations": [
    {
      "statement": "Unmapped locations are not evidence that the commodity is absent.",
      "category": "interpretation"
    },
    {
      "statement": "Feature-level mapping year may vary across the dataset.",
      "category": "currency"
    }
  ],
  "interpretationGuidance": [
    "Use feature-level year/currency fields where available.",
    "Aggregate results to a scale compatible with the source mapping resolution."
  ],
  "granularity": {
    "entity": "mapped crop feature",
    "spatial": "feature/polygon",
    "temporal": "mapping campaign / feature-level year"
  },
  "methodology": {
    "description": "Tree-crop mapping produced using the custodian's published mapping workflow.",
    "url": "https://example.org/methodology"
  },
  "provenance": {
    "method": "manual",
    "generatedAt": "2026-09-14T10:00:00Z",
    "reviewStatus": "custodian-approved",
    "reviewedAt": "2026-09-14T11:00:00Z"
  }
}
```

## `schemaVersion`

Required string identifying the aspect contract version.

Initial value:

```text
1.0
```

Consumers should tolerate additive fields within the same major version.

## Summary

`summary` is an optional concise statement answering:

> What kind of analytical evidence is this dataset primarily useful for?

It should not simply repeat the dataset's descriptive abstract.

## Intended uses

`intendedUses` records known or documented uses without asserting that all are scientifically validated.

Each item may contain:

- `purpose`;
- `description`;
- optional `audience`;
- optional evidence references.

Examples:

- regional situational awareness;
- surveillance planning;
- trend analysis;
- exposure analysis;
- model input;
- reporting/statistical aggregation.

## Fitness assessments

`fitnessAssessments` is the strongest structured part of the model.

Each assessment binds a **specific purpose/question** to an assessment and rationale.

Initial assessment values:

- `suitable`;
- `conditionally-suitable`;
- `not-suitable`;
- `unknown`.

Example:

```json
{
  "purpose": "Estimate current production volume by individual business",
  "assessment": "not-suitable",
  "rationale": "The source contains mapped area but no validated current production-volume measure."
}
```

The purpose text must be specific enough that the assessment is not interpreted as a universal quality score.

### Conditions

A conditional assessment may include explicit conditions:

```json
{
  "purpose": "Regional exposure modelling",
  "assessment": "conditionally-suitable",
  "conditions": [
    "Use at regional rather than parcel-level resolution",
    "Include mapping year in uncertainty reporting"
  ]
}
```

## Limitations

`limitations` captures general caveats that affect interpretation across several use cases.

Suggested categories include:

- `coverage`;
- `currency`;
- `resolution`;
- `sampling`;
- `measurement`;
- `classification`;
- `bias`;
- `completeness`;
- `interpretation`;
- `privacy`;
- `governance`;
- `other`.

The category list should remain extensible.

A limitation may contain:

- `statement`;
- `category`;
- optional severity/importance label;
- evidence;
- provenance override where different from the aspect-level source.

The first version should avoid a numerical confidence score unless a source supplies a meaningful documented measure. A generic model-generated confidence number can create false precision.

## Interpretation guidance

`interpretationGuidance` contains practical instructions that help a researcher avoid common misuse.

Examples:

- report the observation year with results;
- aggregate only to a specified scale;
- treat missing values as unknown rather than zero;
- use a particular field rather than a display label;
- do not infer absence from lack of a mapped feature.

This section is explanatory, not executable query policy.

## Granularity

The optional `granularity` object explains the level at which evidence should be interpreted.

Possible properties:

- `entity` — e.g. property, business, survey, specimen, raster cell, feature;
- `spatial` — human-readable analytical granularity;
- `temporal` — snapshot, daily, annual, mapping campaign, etc.;
- `population` — where useful.

This should complement, not duplicate, existing spatial/temporal coverage extents.

Example:

```json
{
  "entity": "survey event",
  "spatial": "site-level observation",
  "temporal": "observation date"
}
```

## Methodology

The `methodology` object can point to the process by which the dataset was created.

Suggested fields:

- `description`;
- `url`;
- `citation`;
- optional version/date.

The design should prefer links/citations to substantial methodology documents rather than copying them into the aspect.

## Evidence

Fitness and limitation claims may include evidence references.

Proposed generic form:

```json
{
  "type": "methodology",
  "title": "Tree Crop Mapping Method",
  "url": "https://example.org/methodology",
  "citation": "..."
}
```

Other evidence types may include:

- `custodian-statement`;
- `methodology`;
- `publication`;
- `validation-study`;
- `data-quality-report`;
- `legal-policy`;
- `other`.

A claim can exist without a public URL, but its provenance/review status must remain clear.

## Provenance and review

Aspect-level provenance should record how the guidance was created.

Suggested fields:

```json
{
  "method": "agent-generated",
  "generatedAt": "2026-09-14T10:00:00Z",
  "generator": "...",
  "sourceUrls": ["https://example.org/docs"],
  "reviewStatus": "unreviewed"
}
```

Initial `method` values:

- `custodian-authored`;
- `manual`;
- `authoritative-import`;
- `agent-generated`;
- `inferred`.

Initial `reviewStatus` values:

- `unreviewed`;
- `reviewed`;
- `custodian-approved`;
- `rejected`.

Optional review metadata may include:

- `reviewedAt`;
- reviewer role/organisation label where appropriate;
- review note.

The design should avoid storing unnecessary personal information about reviewers when an organisational/role label is sufficient.

## Claim-level provenance

An individual fitness assessment or limitation may override the aspect-level provenance.

This is useful when, for example:

- most of the aspect was generated by an agent;
- one limitation is copied from a custodian methodology document;
- a domain expert has reviewed one assessment but not the rest.

Example:

```json
{
  "statement": "Absence from the map is not evidence of crop absence.",
  "category": "interpretation",
  "provenance": {
    "method": "custodian-authored",
    "reviewStatus": "custodian-approved",
    "sourceUrl": "https://example.org/methodology"
  }
}
```

## Authoring workflow

### Custodian/manual authoring

An editor may directly create the aspect from known documentation and domain expertise.

This is the preferred path for high-stakes claims such as explicit non-inferences.

### Agent-assisted authoring

An agent may read:

- dataset description;
- methodology/documentation;
- data dictionary;
- bounded samples;
- cited publications;

and propose usage/limitation statements.

The generated result must begin as `unreviewed`. The UI and machine clients must not hide that status.

### Review

A reviewer should be able to:

- accept generated content;
- edit a claim;
- reject a claim;
- approve the overall aspect or selected claims.

The initial storage model should support review state even if the first web-client release uses existing aspect editing/admin mechanisms rather than a bespoke review workflow.

## Relationship to quality metadata

`dataset-usage` is not a generic quality score.

A dataset can be high quality for one purpose and unsuitable for another. Existing or future quality metrics may provide evidence, but fitness assessments should remain purpose-specific.

Example:

- complete regional coverage may make a dataset useful for broad exposure mapping;
- the same dataset may still be unsuitable for property-level current-production claims due to temporal currency.

## Relationship to access and governance

Some usage limitations are governance-related, but this aspect does not grant or deny access.

For example:

```json
{
  "statement": "Results derived from this dataset must be reported only in aggregated form under the data-sharing agreement.",
  "category": "governance"
}
```

may be useful explanatory metadata, but enforceable permissions still belong in the relevant policy/access systems.

## Web-client design

The dataset page should render a prominent **Using this dataset** section when `dataset-usage` exists.

The first version should show:

- usage summary;
- intended uses;
- fitness assessments grouped by suitable / conditional / not suitable where helpful;
- limitations;
- interpretation guidance;
- methodology/evidence links;
- granularity notes;
- provenance and review badge.

Important trust cues should be visible rather than hidden in raw JSON.

Example:

```text
Using this dataset

Useful for
  ✓ Regional distribution of mapped citrus production areas
  ~ Regional exposure analysis when mapping currency is acceptable

Do not use to establish
  ✕ Whether an individual property is currently producing citrus

Important limitations
  • Unmapped parcels are not proof of absence
  • Mapping year varies by feature

Status
  Custodian approved · reviewed 14 Sep 2026
```

An unreviewed agent-generated version should say so explicitly.

## Search and semantic indexing

Selected usage metadata can improve discovery.

Examples of useful indexed content:

- intended uses;
- purpose text from fitness assessments;
- limitation statements;
- methodology concepts.

This could enable queries such as:

- "datasets useful for regional citrus exposure modelling";
- "data that can identify individual properties";
- "datasets with property-level limitations".

Search ranking should not treat an unreviewed agent-generated suitability claim as equivalent to custodian-approved guidance without considering provenance.

## Agent consumption

A future agent should use `dataset-usage` as evidence when deciding whether to select a dataset for a task.

Example reasoning pattern:

1. identify candidate datasets by topic/fields;
2. inspect `dataset-usage` for purpose-specific fitness and limitations;
3. inspect `data-dictionary` for required variables;
4. inspect `distribution-contract` for usable access/query mechanisms;
5. present limitations alongside any proposed analysis.

The agent must not infer that absence of a `not-suitable` claim means the dataset is suitable.

## Combining with other datasets

Usage metadata can explain whether combination is conceptually defensible.

For example, if Dataset A is property-level and current while Dataset B is a regional historical map, a future mediation layer can surface the mismatch before proposing a join.

The first version does not automate this reasoning, but `granularity`, fitness assessments, limitations and evidence provide important inputs.

## Compatibility and evolution

The aspect is optional and additive. Existing dataset pages continue to work unchanged when it is absent.

Within schema version 1:

- optional fields may be added;
- existing meanings must remain stable;
- consumers should ignore unknown properties.

The schema should not require every dataset to have fitness assessments. A minimal valid aspect may contain only a reviewed summary and limitations, while richer records can add purpose-specific assessments.

## Acceptance criteria

- The aspect can clearly state why a dataset is useful without duplicating its generic description.
- It can represent purpose-specific suitable, conditional, not-suitable and unknown assessments.
- It can explicitly represent important non-inferences.
- Granularity/currency guidance can be expressed without duplicating existing spatial/temporal extent aspects.
- Methodology/evidence references can support claims.
- Aspect-level and claim-level provenance can distinguish custodian, manual, imported, inferred and agent-generated content.
- Unreviewed agent-generated guidance is visibly distinguishable from reviewed/custodian-approved guidance.
- The aspect does not grant access or replace quality/domain review.
- The web client can present the most important suitability and limitation information without requiring users to inspect raw aspects.
- Agents can consume the aspect without treating missing claims as proof of suitability.
