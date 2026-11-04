# Agent Workspace proposals not yet implemented

The implemented Agent Workspace contracts live under [architecture](../../docs/architecture/agent-workspace.md), [Agent Skills](../../docs/architecture/agent-skills.md), [LLM Services](../../docs/architecture/llm-services.md), [deployment](../../docs/agent-workspace-deployment.md) and [E2E tests](../../docs/e2e-test-cases/README.md).

This directory is **only for open proposals**. A design written here does not claim the feature has been implemented, security-qualified or released. Accepted decisions should be captured in [ADRs](../../docs/adrs/); once implemented, reconcile the maintained architecture and tests, then remove or archive the superseded proposal.

- [Registry-backed LLM access profiles and quotas](./llm-access-profiles.md) — proposed #3838, not in the merged MVP.
- [Mutation confirmation enhancements](./mutation-approval.md) — proposed UX/security improvement; current model-mediated approval has a documented residual risk.
- [Observability and audit](./observability.md) — deferred design, not an implemented service-level contract.
- [GKE security qualification](https://github.com/magda-io/magda/issues/3848) — tracked in public engineering work and the [focused provider E2E](../../docs/e2e-test-cases/agent-workspace-gke-security.md), not a separate duplicative proposal document.
