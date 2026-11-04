# ADR 0003: Kubernetes SandboxClaim as the Agent Workspace lifecycle authority

- **Status:** Accepted (implemented in merged #3850)
- **Date:** 2026-11-04 (documented after implementation)
- **Related:** [#3822](https://github.com/magda-io/magda/issues/3822), [#3823](https://github.com/magda-io/magda/issues/3823), [#3850](https://github.com/magda-io/magda/pull/3850)

## Context

MAGDA needs an isolated, persistent-but-disposable execution environment for each user and installation. Lifecycle operations must survive Agent Manager restarts, reconnection, abandoned provisioning and partially completed deletion. Native DSH conversations should not each consume a separate Sandbox.

## Decision

Use one deterministically named `SandboxClaim` per MAGDA installation and authenticated user as the authoritative current Workspace identity. Kubernetes-owned claim status, labels and annotations identify the adopted Sandbox, incarnation, lifecycle progress and persistent PVC; Agent Manager stays stateless. One Sandbox may hold many DSH conversations. Provision by claiming a warm Sandbox, then apply a user-scoped credential via post-claim bootstrap. READY and essential DSH bootstrap are independent of best-effort skill synchronization.

Use monotonic activity/cleanup state recorded on the claim and a separate system-managed key expiry; reconcile partial failures across the two stores. Suspend at the configured inactivity threshold; reset/terminate/logout revoke credentials and remove claim and PVC, with retryable durable deleting state.

## Consequences

- **Benefits:** fewer application state stores; robust restart/resume; one user resource boundary; predictable cleanup and file persistence until explicit destruction.
- **Costs:** Kubernetes and its CRD/CSI lifecycle are now required; claim and credential expiry are not atomically updated; clean reconciliation and per-user operation serialization are essential.
- **Security:** user-supplied userId, Pod name, claim name or header never selects another Workspace; identify from verified session + installation.

## Alternatives considered

An Agent Manager session database, a Sandbox per chat turn/session, and Pod-name-as-truth were rejected because they duplicate or fragment lifecycle state and complicate crash recovery.

## Verification

See [Workspace architecture](../architecture/agent-workspace.md), [deployment](../agent-workspace-deployment.md) and [lifecycle E2E](../e2e-test-cases/agent-workspace.md). GKE production security qualification remains separate (#3848).
