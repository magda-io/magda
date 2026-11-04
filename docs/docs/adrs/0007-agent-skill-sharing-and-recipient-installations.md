# ADR 0007: Shared skill source and recipient-owned installation are distinct

- **Status:** Accepted (merged #3864)
- **Date:** 2026-11-04 (documented after implementation)
- **Related:** [#3861](https://github.com/magda-io/magda/issues/3861), [#3864](https://github.com/magda-io/magda/pull/3864)

## Context

Users need to reuse published expertise without adopting its author's identity or inadvertently gaining the author's datasets and model resources. Sharing, installation, local copies, revocation and forking are separate lifecycle decisions.

## Decision

Represent a skill as a source-owned Registry publication and validated ZIP. Grant source read with a **publication-incarnation-scoped typed Access Group**. A recipient explicitly creates their own `agent-skill-installation` record with source ID and optional alias; this record **does not** copy the archive, grant source read, or grant dataset/model distribution read. Manifests independently reauthorise source and installation reads as the recipient.

Revoking a source grant prevents future authorised resolution and leaves the recipient installation safely uninstallable. Already-synced files may remain until reconciliation. Publishing an installed shared copy requires an explicit **fork** into a recipient-owned publication; never mutate the publisher's source.

## Consequences

- Sharing grants expertise visibility, not authority or an automatic environment change.
- Source and recipient ownership are auditable and independently revocable.
- Alias conflicts, local edits, partial updates and revocation require clear diagnostics.
- Access Group source updates currently rely on a process-local lock in the one-replica Manager; multi-replica operation requires stronger transaction/CAS coordination.
- Fork crosses source/installation records with recoverable, not fully atomic, lifecycle steps.

## Alternatives considered

Cloning the ZIP into every recipient's independent publication on share, giving recipients source write permission, auto-installing every readable skill and transferring dataset grants with a skill were rejected due to synchronization, provenance and privilege problems.

## Verification

See [Skill authorization](../architecture/agent-skills-authorization.md) and [sharing E2E](../e2e-test-cases/agent-skills-sharing.md).
