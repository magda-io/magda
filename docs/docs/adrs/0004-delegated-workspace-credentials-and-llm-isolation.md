# ADR 0004: Delegate only user-scoped MAGDA authority to Sandboxes

- **Status:** Accepted (implemented in merged #3850)
- **Date:** 2026-11-04 (recorded retrospectively)
- **Related:** [#3825](https://github.com/magda-io/magda/issues/3825), [#3850](https://github.com/magda-io/magda/pull/3850)

## Context

An agent must use existing MAGDA datasets under its user's authorization without receiving a browser session, a permanent credential, an Agent Manager administrator key, or raw model-provider credentials. Agent tools may execute untrusted code.

## Decision

Agent Manager checks the authenticated user and self-only `agentWorkspace/access` permission. After adopting a claim, provision a lifecycle-bound, expiring *system-managed API key for that same user* via a one-time stdin bootstrap. Store it mode 0600 on the user PVC for `mgd` and DSH, and revoke it during destructive lifecycle cleanup. The Gateway/Manager proxy DSH without forwarding the caller's browser session or DSH launch token.

MAGDA LLM Services independently authorises the caller's Workspace route and applies the deployment model allowlist, then supplies internal credentials to **private** LiteLLM. Provider credentials never enter Sandboxes. Data operations continue to go through normal MAGDA API/OPA checks.

## Consequences

- A compromised Sandbox may exercise **that user's** available MAGDA rights while the key remains valid; expiry and lifecycle revocation reduce, but do not eliminate, that exposure.
- Browser, Manager and provider secrets are not colocated with user code.
- System-managed key expiry and SandboxClaim lifecycle require reconciliation after partial outages.
- `agentWorkspace/access` is not fine-grained per-model authorization; Registry-backed profiles and quotas remain future #3838 work.

## Alternatives considered

Passing the browser's MAGDA session, giving the Sandbox an administrator JWT, putting provider keys into DSH, and adding a parallel bespoke agent-token authority were rejected due to unnecessary privilege or duplicated identity state.

## Verification

See [security architecture](../architecture/agent-workspace-security.md), [LLM Services](../architecture/llm-services.md) and [Workspace E2E](../e2e-test-cases/agent-workspace.md). Cloud IAM/metadata isolation remains a separate #3848 gate.
