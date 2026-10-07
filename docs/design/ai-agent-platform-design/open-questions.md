# Open questions and evolving design queue

**Status:** Continuously maintained under #3811

## Foundation now settled

#3822, #3823 and #3825 are Accepted:

- one user -> one deterministic SandboxClaim -> one current Sandbox;
- no Agent Manager database or separate session id;
- claim status resolves warm-adopted Sandbox;
- dedicated PVC per Sandbox;
- configurable WarmPool (0 local/lightweight, 2 recommended production start);
- post-claim Kubernetes-exec bootstrap;
- 30m suspend / 8h hard-delete defaults;
- logout/new-agent permanent cleanup;
- DSH/workspace disk persistence but no process-memory persistence;
- one lifecycle-bound user-scoped Magda API key is placed in the Sandbox;
- the agent acts on behalf of the user under normal Magda auth/OPA;
- mutation confirmation is an agent/DSH UX contract rather than a separate server-side delegated-authority boundary;
- provider credentials remain outside the Sandbox.

## Remaining dependency-critical questions

### #3824 — DSH browser-auth/bridge verification

The general proxy/bootstrap model is settled, but the pinned DSH version still needs verification for:

- launch-token capture without logs/browser exposure;
- server-side token/cookie exchange;
- Host/Origin/CSRF/WebSocket proxy behavior;
- restart/re-authentication;
- whether a newer supported DSH hook can simplify/remove the bridge.

### #3838 — Magda LLM Services

The architecture is settled around a separate reusable Magda LLM Services + internal LiteLLM component. Remaining detail includes:

- exact external model APIs;
- generic-authorisation resource/action shape;
- model aliases/config;
- internal LiteLLM credential lifecycle;
- streaming/error/usage behavior;
- HA documentation with Redis disabled.

## Later design areas

- optional structured DSH approval integration for mutating `mgd` operations;
- provider-specific egress/network enforcement;
- user/global skill storage and trust model;
- full web/product UX;
- deployment/Helm/provider qualification;
- observability/audit;
- WebGPU migration/deprecation;
- AKS/Kata production qualification;
- future EKS/Fargate support (#3821).

Do not reopen accepted foundation questions merely because implementation details differ. If implementation evidence invalidates a contract, update the owning design explicitly.
