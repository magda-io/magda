# ADR 0005: Service-owned Agent Skill validation with typed authorization

- **Status:** Accepted (merged #3850, #3870, #3880)
- **Date:** 2026-11-04 (documented after implementation)
- **Related:** [#3850](https://github.com/magda-io/magda/pull/3850), [#3870](https://github.com/magda-io/magda/pull/3870), [#3880](https://github.com/magda-io/magda/pull/3880)

## Context

Registry/Storage are generic substrates, but Agent Skill publications require immutable identities, validated archives and typed authorization. Injecting cross-field identity rules into OPA made Registry partial-evaluation filters untranslatable; allowing ordinary generic Registry writes bypassed validation.

## Decision

Keep OPA responsible for *authorization*, expressed as simple translatable comparisons; move deterministic IDs, names, type immutability, owner, archive linkage and ZIP integrity validation into Agent Services. Agent Services first authorises the real caller for the one requested typed skill operation, then writes validated Registry/Storage state using a confined short-lived internal session. Reads/lists/manifest resolution use the real caller and repeat typed read checks.

Make constrained generic `object/record` and Storage grants inapplicable to typed skill and installation records/archives. Retain explicitly **trusted** administrator and unconstrained generic grants as storage-level exceptions. Protect generic Registry mutations through current/proposed-state checks within the transaction, with batch checks for bulk paths and per-record locks for single paths.

## Consequences

- Publications and installations preserve service-owned identity invariants without untranslatable OPA partial decisions.
- Internal service attribution appears in Registry write events and Storage object ownership; real publisher metadata remains on Agent Skill records.
- Trusted generic writers can still bypass Agent Services' semantic validation; no claim of a sandbox from cluster administrators is implied.
- The authorization/validation split is reusable for other Registry-backed applications.

## Alternatives considered

Validation inside Rego, broad typed write delegation through generic Registry APIs, a new Skill database, new skill-specific Registry endpoints and a Storage owner-override parameter were rejected for complexity, translatability or privilege risks.

## Verification

See [Skill authorization](../architecture/agent-skills-authorization.md), [Guide to Magda Internals](../architecture/Guide%20to%20Magda%20Internals.md) and [E2E security checks](../e2e-test-cases/agent-skills-sharing.md).
