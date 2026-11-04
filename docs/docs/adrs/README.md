# Architecture Decision Records (ADRs)

This folder records significant architectural / design decisions made in Magda —
the context, the decision, its consequences, and the alternatives considered — so
the reasoning behind non-obvious choices isn't lost.

Use an ADR when a change involves a decision that is expensive to reverse, affects
a public interface or the security model, or would otherwise leave future readers
wondering "why was it done this way?".

## Format & conventions

- One decision per file, named `NNNN-short-title.md` (zero-padded, incrementing).
- Suggested sections: **Status** (Proposed / Accepted / Superseded), **Context**,
  **Decision**, **Consequences**, **Alternatives considered**, and any
  implementation notes worth preserving near the decision.
- Prefer linking to GitHub issues/PRs for tracking, and to the relevant code.

## Index

- [0001 — Large file upload/download support for magda-storage-api](./0001-large-file-storage-support.md)
- [0002 — Classify outcomes by a stable signal, not by a tool's output text](./0002-classify-outcomes-by-stable-signal.md)

- [0003 — Kubernetes SandboxClaim as the Agent Workspace lifecycle authority](./0003-kubernetes-sandboxclaim-as-workspace-authority.md)
- [0004 — Delegate only user-scoped MAGDA authority to Sandboxes](./0004-delegated-workspace-credentials-and-llm-isolation.md)
- [0005 — Service-owned Agent Skill validation with typed authorization](./0005-agent-skills-service-owned-authorization.md)
- [0006 — Scan-based, independently recoverable Agent Skill synchronization](./0006-scan-based-agent-skill-synchronization.md)
- [0007 — Shared skill source and recipient-owned installation are distinct](./0007-agent-skill-sharing-and-recipient-installations.md)
- [0008 — Model-mediated Agent Skill publication consent in the MVP](./0008-model-mediated-agent-skill-publication-approval.md)
- [0009 — Isolated, on-demand Python dependencies in Agent Sandboxes](./0009-on-demand-python-environments-in-sandboxes.md)
