# Dataset Usage / Fitness-for-Use Extension Design

## Status

**Deferred / use-case driven.**

This design is retained as a possible future Magda capability, but `dataset-usage` is **not required for the Magda v7 Data Understanding Layer core** and should not be implemented merely to complete that layer.

The completed v7 core is:

- `data-dictionary` at distribution level: what information a representation contains;
- `distribution-contract` at distribution level: how that representation can be accessed or queried;
- existing dataset metadata such as `description`, `spatial-coverage`, `temporal-coverage`, provenance/source metadata, themes and keywords for dataset-level context.

A structured dataset-level usage/fitness aspect should be revisited only when a concrete project has authoritative fitness-for-use or non-inference claims that need to be consumed programmatically.

## Why implementation is deferred

The original proposal bundled several kinds of dataset-level metadata into a new first-party aspect:

- a usage summary;
- intended uses;
- purpose-specific fitness assessments;
- limitations and interpretation guidance;
- spatial/temporal/entity granularity;
- methodology/evidence references;
- provenance and review state.

After implementing the Data Dictionary (#3807) and Distribution Contract (#3808), much of that information is already represented adequately elsewhere:

| Information | Existing / preferred home |
| --- | --- |
| What the dataset is and why it exists | dataset `description` |
| Topic/discovery concepts | themes, keywords and semantic indexing |
| Geographic extent | `spatial-coverage` |
| Time period covered | `temporal-coverage` |
| Fields/entities, types, units and structural semantics | `data-dictionary` |
| Distribution access/query mechanics | `distribution-contract` |
| Source/provenance context | existing source/provenance metadata and linked documentation |
| General methodology narrative | dataset description or linked source documentation |

Creating another structured aspect for these concepts would introduce overlapping sources of truth and additional authoring/review burden without enough demonstrated value.

In particular, human-readable `summary`, `intendedUses`, `granularity` and general `interpretationGuidance` can easily drift from the dataset description, coverage aspects and data dictionary.

## The remaining gap

There is still one information class that existing metadata does not represent particularly well:

> **authoritative, purpose-specific claims about what conclusions a dataset is or is not fit to support.**

Examples:

- "Not suitable for determining whether an individual property is currently producing citrus."
- "Suitable for regional exposure analysis only when the published mapping currency is acceptable."
- "Absence from the map is not evidence of absence."

These statements are different from structure or access metadata. They are domain claims about interpretation and evidentiary limits.

They can be valuable to both people and software agents **when they come from an authoritative source and need machine-readable treatment**.

## Why ordinary description is the default

For normal catalogue records, dataset-level context should remain in the existing `description` and related metadata.

A consumer or agent can combine:

1. dataset description;
2. spatial and temporal coverage;
3. source/provenance metadata;
4. `data-dictionary`;
5. `distribution-contract`;
6. linked methodology/source documentation;

to determine whether a dataset appears relevant to a task.

This avoids creating a parallel structured representation for prose that does not need independent machine semantics.

A future structured aspect is justified only when software needs to preserve and consume an explicit authoritative claim without reinterpreting general prose.

## Revisit criteria

Revisit implementation of `dataset-usage` when at least one real project can answer **yes** to the following:

- Does the project have concrete fitness-for-use, limitation or non-inference claims that are not adequately represented by dataset description/coverage/structure/access metadata?
- Are those claims authored or reviewable by a custodian/domain authority?
- Does a machine consumer need the claims in structured form rather than merely displaying/searching prose?
- Is there a maintenance owner or source of truth for the claims?
- Is the benefit large enough to justify provenance/review semantics and a dedicated UI/model?

A request to make an agent "smarter" by itself is not sufficient justification. If an agent can derive a tentative judgement from existing metadata and documentation, that judgement should remain part of the agent's reasoning rather than automatically becoming durable catalogue truth.

## Possible future narrow v1

If the revisit criteria are met, prefer a deliberately small aspect whose responsibility is limited to **fitness assessments and important limitations**.

Possible shape:

```json
{
  "schemaVersion": "1.0",
  "fitnessAssessments": [
    {
      "purpose": "Identify current production at an individual property",
      "assessment": "not-suitable",
      "rationale": "The mapping method and currency do not establish current production status.",
      "evidence": [
        {
          "type": "methodology",
          "url": "https://example.org/methodology"
        }
      ]
    }
  ],
  "limitations": [
    {
      "statement": "Absence from the map is not evidence of absence.",
      "category": "interpretation",
      "evidence": [
        {
          "type": "custodian-statement",
          "url": "https://example.org/guidance"
        }
      ]
    }
  ],
  "provenance": {
    "method": "custodian-authored",
    "reviewStatus": "custodian-approved"
  }
}
```

### Candidate fields

A future narrow v1 may include:

- `schemaVersion`;
- `fitnessAssessments[]`:
  - `purpose`;
  - `assessment`: `suitable`, `conditionally-suitable`, `not-suitable`, or `unknown`;
  - `rationale`;
  - optional `conditions`;
  - optional evidence references;
  - optional claim-level provenance override;
- `limitations[]`:
  - `statement`;
  - optional category;
  - optional evidence references;
  - optional claim-level provenance override;
- aspect-level provenance/review state.

The exact schema should be designed from the concrete project claims rather than freezing it now.

## Deliberately excluded from a future narrow v1

Unless a concrete use case proves otherwise, do **not** add the following merely because they were in the original proposal:

### `summary`

Use the dataset description. A second "why useful" summary is likely to duplicate or drift from it.

### `intendedUses`

Keep ordinary intended-use prose in the dataset description or linked documentation. Add a structured item only when it is part of an explicit fitness claim.

### `granularity`

Do not duplicate spatial/temporal coverage or structural metadata.

For example:

- geographic extent belongs in `spatial-coverage`;
- covered dates belong in `temporal-coverage`;
- entity/feature/row concepts belong in `data-dictionary`;
- analytical restrictions such as "regional only, not property-level" belong in a fitness assessment or limitation when authoritative.

### general `interpretationGuidance`

Ordinary explanatory guidance belongs in description/documentation. Preserve only guidance that forms a material fitness condition or non-inference claim.

### methodology description

Prefer a methodology/source link or evidence reference rather than copying another narrative description into the aspect.

## Trust model

Fitness-for-use is a domain judgement, not an objective schema fact.

That makes this metadata fundamentally different from most information harvested into `data-dictionary` and `distribution-contract`.

If a future aspect is implemented:

- provenance and review state are part of the meaning of every claim;
- custodian-authored/imported claims and reviewed claims should be distinguishable from inferred or agent-generated claims;
- missing claims must never be interpreted as proof of suitability;
- a purpose-specific assessment must never become a generic dataset quality score;
- the aspect must not grant or deny access;
- native methodology and policy sources remain authoritative.

## Agent-generated content

An agent may use existing catalogue metadata and source documentation to make a task-specific suitability judgement for the current interaction.

That does **not** mean the judgement should automatically be persisted as `dataset-usage`.

Persisting an agent-generated fitness claim creates a risk that a later agent treats an earlier model judgement as catalogue evidence. If agent-assisted authoring is eventually supported, generated claims should be clearly advisory/unreviewed and should require an explicit review path before being treated as authoritative guidance.

## Relationship to the v8 Agent Platform

The v8 agent can already reason from:

- dataset description;
- spatial/temporal coverage;
- `data-dictionary`;
- `distribution-contract`;
- provenance/source metadata;
- source documentation it is authorised to inspect.

A future `dataset-usage` aspect would be an additional source of **authoritative domain guidance**, not a prerequisite for agent operation.

The agent should continue to make task-specific judgements itself and surface uncertainty/limitations. It must not treat absence of a structured fitness claim as evidence that a dataset is suitable.

## Relationship to the Data Understanding Layer

For v7, the core Data Understanding Layer consists of the two normalized distribution-level contracts plus existing dataset-level catalogue metadata.

`dataset-usage` is therefore an **optional future extension**, not the missing third leg required to complete the core.

See [Data Understanding Layer Design](./data-understanding-layer-design.md).

## Future acceptance criteria

If implementation is reactivated, acceptance criteria should be derived from a concrete project, but should at minimum require:

- a real authoritative fitness/limitation use case that cannot be adequately handled by existing description/coverage/structure/access metadata;
- clear ownership/review of the claims;
- purpose-specific assessments rather than generic quality scores;
- explicit non-inference/limitation support;
- evidence and provenance sufficient for consumers to understand authority;
- safe handling of unreviewed/agent-generated claims;
- no unnecessary duplication of description, spatial coverage, temporal coverage or data dictionary metadata;
- a demonstrated machine consumer that benefits from the structured representation.
