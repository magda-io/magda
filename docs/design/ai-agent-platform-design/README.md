# Magda v8 AI Agent Platform Design

**Status:** Blueprint in progress  
**Umbrella design issue:** #3811  
**Working PR:** #3819  
**Parent implementation epic:** #3810

This folder is the evolving design blueprint for the Magda v8 AI Agent Platform.

The design is intentionally developed **before** broad implementation starts. The platform has several tightly coupled security, lifecycle, routing, authentication and persistence boundaries; implementation of one component must not depend on guessed behaviour from another component that has not yet been designed.

See [design-process.md](./design-process.md) for how future agents should work on this design.

## Current architectural direction

```text
Browser
  |
  v
Magda Gateway
  |
  v
Agent Manager
  |
  | SandboxClaim / lifecycle
  v
Kubernetes Agent Sandbox
  |
  | deployment-selected isolation
  +-- local development: runc
  +-- local security / PoC: gVisor
  +-- GKE production: gVisor (recommended/reference)
  +-- AKS production: Kata
  |
  v
per-session DSH + mgd + analysis tools
  |
  v
Agent Manager mediated Magda / LLM access
```

The high-level direction is:

- one isolated Agent Sandbox per active Magda agent session;
- DSH and `mgd` run inside the sandbox, not on a shared privileged host;
- Agent Sandbox owns lifecycle while the low-level isolation runtime is deployment policy;
- trusted local development may use runc;
- local security testing uses gVisor;
- GKE + gVisor is the recommended/reference production profile;
- AKS + Kata Pod Sandboxing is an initial supported production target;
- EKS production is not in the initial support commitment; #3821 investigates Fargate later;
- ordinary runc is not the production fallback simply because a cloud lacks a supported strong-isolation profile;
- the browser never talks directly to a Sandbox Pod;
- reusable platform/provider credentials should remain outside the untrusted sandbox;
- durable user knowledge must be separated from disposable execution state.

These are architecture-level decisions. Detailed contracts live in the documents below and may still change while #3811 remains open.

## Why this is a folder rather than one design document

The original #3819 draft placed runtime, session lifecycle, Agent Manager, routing, authentication, skills, persistence, networking, security, deployment and implementation ordering into one file.

That was useful as an initial architecture sketch, but it creates a dangerous failure mode: an implementation ticket can read a provisional statement about another component as though it were already a settled interface.

The blueprint therefore separates:

1. **overview architecture** — this file;
2. **design process and design maturity** — [design-process.md](./design-process.md);
3. **component/aspect contracts** — detailed files below;
4. **evidence / experiments** — investigation docs and PoC tickets such as #3812;
5. **implementation tickets** — created only when the design slice and its required input contracts are settled.

The file decomposition is a starting point, not a permanent taxonomy. Split, merge or rename documents when the design reveals a better boundary.

## Design dependency graph

The design is a dependency graph, not a linear implementation plan.

```text
                 Sandbox runtime
                       |
                       v
                Session lifecycle
                  /          \
                 v            v
          Agent Manager    Persistence
              |  \
              |   \
              v    v
       DSH integration   Delegated auth
              \           /
               \         /
                v       v
              Magda operations
                    |
                    v
             Mutation approval

Runtime + Auth + Network
          |
          v
 Deployment / hardening

Skills -----------------> Web UI
Observability ----------> all components
```

The graph will evolve. When a detailed design changes an upstream contract, update this overview and the affected dependent design docs/tickets.

## Design documents

| Area | File | Current design ticket / status |
| --- | --- | --- |
| Design working model | [design-process.md](./design-process.md) | Guidance for all #3811 work |
| Sandbox runtime | [sandbox-runtime.md](./sandbox-runtime.md) | #3822 — foundation design |
| Session lifecycle | [session-lifecycle.md](./session-lifecycle.md) | #3822 — foundation design |
| Agent Manager | [agent-manager.md](./agent-manager.md) | #3823 — blocked on foundation inputs |
| DSH integration / bridge / routing | [dsh-integration.md](./dsh-integration.md) | #3824 — depends on foundation; coordinates with #3823 |
| Delegated authentication | [authentication.md](./authentication.md) | #3825 — depends on foundation + Agent Manager contract |
| Network / security | [network-security.md](./network-security.md) | Draft; create a focused ticket when prerequisite contracts mature |
| Mutation approval | [mutation-approval.md](./mutation-approval.md) | Draft; later design slice |
| Skills | [skills.md](./skills.md) | Draft; later design slice |
| Web/product integration | [web-ui.md](./web-ui.md) | Draft; later design slice |
| Deployment / Helm | [deployment.md](./deployment.md) | Draft; depends on runtime/security contracts |
| Observability / audit | [observability.md](./observability.md) | Draft; cross-cutting |
| Open questions / future design queue | [open-questions.md](./open-questions.md) | Continuously maintained |

A separate `persistence.md` may be split out later. For now, session/workspace persistence is kept with lifecycle because #3822 needs to decide the fundamental disposable-vs-persistent session contract before a stable persistence boundary exists.

## Active design sequence

Only the next dependency-critical design slices are ticketed now:

1. #3822 — sandbox runtime + session lifecycle foundation;
2. #3823 — Agent Manager control-plane contract;
3. #3824 — DSH integration, bridge/bootstrap and browser routing;
4. #3825 — delegated authentication and credential boundaries.

Do **not** create every possible design ticket upfront. #3811 is the umbrella and should evolve as these designs reveal better component boundaries or new evidence requirements.

## Evidence already available

The completed #3812 / PR #3817 Minikube PoC provides measured evidence for:

- Agent Sandbox + gVisor on Minikube;
- DSH confinement behaviour under gVisor/runc;
- browser/runtime connectivity constraints;
- sandbox/PVC lifecycle observations;
- resource footprint and performance;
- isolation/security smoke tests.

See:

- `docs/investigations/v8-agent-sandbox-minikube.md`
- #3812
- PR #3817

Use those results where they directly apply. Do not generalise a gVisor-specific result to AKS/Kata without evidence.

Future EKS/Fargate portability is tracked separately by #3821 and is not an initial v8 release blocker.

## Platform goals

The initial v8 design should make it possible for a signed-in Magda user to:

- open a capable DSH-based agent through the Magda web UI;
- receive a private agent execution environment without installing a local coding agent;
- use `mgd` and approved local analysis tools;
- reconnect to the active session;
- reset/start a clean session;
- act only with the user's authorised Magda permissions;
- perform consequential mutations only through an explicit, server-enforced approval model;
- preserve durable user knowledge independently of disposable sandbox state.

Operators should be able to:

- select the supported runtime/deployment profile;
- enforce strong production isolation and network policy;
- set resource limits;
- manage model/provider access;
- provide trusted global skills;
- observe/audit lifecycle and consequential operations.

## Cross-component design principles

1. **The sandbox contains the agent, not only its shell commands.**
2. **Agent Sandbox lifecycle and runtime isolation are separate concerns.**
3. **Production uses a provider-supported strong isolation profile; runc is trusted-development only.**
4. **Reusable knowledge is separate from disposable execution state.**
5. **Arbitrary agent-controlled code does not receive reusable platform/provider secrets.**
6. **Existing Magda authorisation remains authoritative.**
7. **High-risk boundaries are server/runtime enforced, not prompt enforced.**
8. **Provider/runtime-specific behaviour must not leak into Agent Manager unless it is an explicit contract.**
9. **Implementation depends on settled contracts, not inferred future designs.**

## Candidate future implementation workstreams

These are **not an implementation order** and should not be turned into tickets merely because they are listed here.

Potential workstreams include:

- agent runtime image and SandboxTemplate assets;
- Agent Manager;
- DSH bridge/bootstrap and browser proxy;
- managed-agent `mgd` authentication;
- LLM proxy;
- web-client agent experience;
- mutation approval;
- user skills and trusted global skills;
- production egress/resource controls;
- observability/security integration tests;
- Helm/operator support;
- migration/coexistence with the current WebGPU agent.

Create implementation tickets only when the relevant design slice passes the gate in [design-process.md](./design-process.md).

## Relationship to the Data Understanding Layer

The v7 Data Understanding Layer remains complementary:

- `data-dictionary`: what a distribution contains;
- `distribution-contract`: how it can be accessed/queried;
- `dataset-usage`: suitability and limitations.

These aspects can make DSH + `mgd` planning more deterministic, but they do not replace Agent Manager execution policy, delegated auth, network controls or approval.

## Migration from the current WebGPU agent

The current browser/WebGPU agent should remain available during the early v8 transition. The new sandboxed platform should be introduced behind its own feature flag/entry point until production evidence is sufficient to make a later migration/deprecation decision.
