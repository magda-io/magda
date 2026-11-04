# ADR 0011: Keep Data Understanding metadata provenance-aware and advisory

- **Status:** Accepted for implemented v7 core (#3820, #3828); producer merging is future work
- **Date:** 2026-11-04 (documented retrospectively)
- **Related:** [#3820](https://github.com/magda-io/magda/pull/3820), [#3828](https://github.com/magda-io/magda/pull/3828), [future dictionary producers #3813](https://github.com/magda-io/magda/issues/3813), [future contract producers #3814](https://github.com/magda-io/magda/issues/3814)

## Context

Human corrections, custodian-approved fields and automatically inferred/source-imported values can coexist in the same metadata object. A client must not mistake an unreviewed inference or old source snapshot for authoritative truth. Registry payloads also come from heterogeneous producers and cannot be trusted solely because they parse as JSON.

## Decision

The v7 Data Understanding aspects are **descriptive metadata with provenance and review state**, not claims of authority or runtime permission. Use an additive `schemaVersion` 1.x compatibility contract, extensible vocabularies and explicit source/native-specification references. Preserve unknown optional properties for forward compatibility where safe.

- Capture provenance at the appropriate levels (for example root/entity/field or contract/operation/parameter and property overrides). A more-specific declared provenance takes precedence; avoid merging attributes from incompatible origins into invented authority.
- Reject empty/meaningless provenance objects that would hide inherited review state. Data Dictionary inference requires a bounded sample extent; Distribution Contract uses source fingerprints and verification timestamps rather than pretending to infer API contracts from data samples.
- Expose shared **typed normalization and validation** routines for application consumers. Handle unsupported versions, malformed identities, invalid references or unsafe credential fields defensively rather than trusting raw Registry data.
- Keep contract authentication and operation descriptions advisory: **never embed credentials** or treat an endpoint declaration or UI example as consent to execute it. Enforce actual authorization separately.

## Consequences

- Users and agents can distinguish authoritative source-imported, custodian-approved and model-/sample-inferred metadata rather than silently conflating them.
- Consumers can render supported metadata from manually populated aspects, before automatic producers exist.
- Compatibility fixtures and normalized parsing/validation tests define the tested interoperability envelope; no universal lossless mapping of all source specifications is promised.
- Future harvesting **must** preserve reviewed human annotations and detect source drift, but the specific conflict/merge policy and automatic producer implementations remain pending #3813/#3814. This ADR does not claim those future behaviours are already shipped.
- Fitness-for-use judgements are separate from source structure and access contracts; dataset-level usage assertions remain a deferred, case-driven extension, not mandatory v7 core.

## Alternatives considered

Blindly replacing the entire aspect on every reharvest, using flat global provenance only, treating metadata as guaranteed executable/safe, and creating a third mandatory dataset-usage aspect were rejected or deferred because of authority confusion, data loss, or overlapping semantics.

## References and verification

See [Data Dictionary guide](../data-dictionary.md), [Distribution Contract guide](../distribution-contract.md), [Data Understanding Layer design](../../design/data-understanding-layer-design.md), the published schema fixtures and shared TypeScript validator tests. For the cross-aspect decomposition see [ADR 0010](./0010-separate-distribution-structure-and-access-contracts.md).
