# Agent Skill synchronization and local provenance

**Status:** Implemented for Workspace and local `mgd` use in merged #3850/#3864. This page describes the reconciliation contract. See [Agent Skills architecture](./agent-skills.md) for publication APIs, [authorization](./agent-skills-authorization.md) for access control and [ADR 0006](../adrs/0006-scan-based-agent-skill-synchronization.md) for the architectural rationale.

## Sources and desired sets

| Execution target | Eligible sources | Destination |
| --- | --- | --- |
| MAGDA-managed Sandbox | READY system skills, own READY user skills, and **explicitly installed**, currently readable shared skills | Single per-user DSH skill root |
| Local computer | Own READY user skills plus explicitly installed, currently readable shared user skills; *not* auto-installed system skills | Detected Claude Code/Codex/OpenCode roots and configured DSH root |

Each manifest is resolved and paginated for the current caller; an inaccessible shared source is not considered valid simply because an installation record exists. Both local and managed Workspace flows verify the instance/tenant/user identity before reusing cached archives.

## Durable per-installation provenance

The synchronizer makes an **independent actual directory copy** of each managed skill in each selected agent harness. A root-level `.magda-skill-install.json` describes the source account/publication, installed baseline digest and local installation identity. That marker must **not** be included in published ZIPs or authoring drafts.

There is **no** central installed-skill index, all-harness transaction journal or multi-harness rollback. The rest of the durable state is the account-isolated `mgd` verified source/archive cache and explicit `pull` provenance. Account-cache keys include canonical MAGDA URL, tenant and user to prevent cross-account contamination.

The reconciler scans the immediate children of each harness root and compares actual contents against the marker's baseline and the authenticated desired source snapshot. It never overwrites an unmarked unrelated skill directory just because the name matches.

## Reconciliation sequence and failures

1. Authenticate and resolve all required remote publication metadata/ZIPs. Verify signatures/checksums and source permissions before changing local installations.
2. If a required current source or infrastructure service cannot be verified, stop the **remote preparation** phase and preserve existing managed copies; do not treat an outage as an empty desired set.
3. Independently reconcile each selected harness. Clean copies may be added, replaced, removed or repaired; an edited copy produces `LOCAL_MODIFICATION` (or a related conflict) and is left untouched unless the user explicitly chooses force.
4. A partial per-skill failure does not roll back unrelated successful reconciliations. A crash or lost staging directory is recovered on a later scan. Local profile selection is committed before reconciliation, rather than rolled back as an across-harness transaction.
5. Workspace bootstrap and **READY** are independent of optional skill sync. The Manager reports `success`, `partial`, `failed` or `notAttempted` and allows user-confirmed **Retry / Re-check**. A manual CLI sync does not rewrite the Manager's last-run status annotation.

`mgd agent-skill sync` is ordinary, conflict-aware reconciliation. `--force` discards divergent managed edits, so UI-initiated force requires a warning/confirmation. Publishing an installed shared skill must first refuse; an explicit `publish --force` can fork after validating recipient authority. The source publication remains unchanged.

## Operations and tests

Use [deployment and operations](../agent-workspace-deployment.md) for paths/storage and [Agent Workspace E2E](../e2e-test-cases/agent-workspace.md) plus [sharing tests](../e2e-test-cases/agent-skills-sharing.md) for recovery, revocation, collision and outage tests.

Revoked source permissions prevent future authorised acquisition. **Already-synced offline copies are not continuously policed**; they are removed only through subsequent successful reconciliation under the documented conflict policy. The product must not promise instantaneous revocation of copies outside MAGDA.