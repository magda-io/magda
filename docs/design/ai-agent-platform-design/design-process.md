# AI Agent Platform design process

**Status:** Active guidance for #3811  
**Working PR:** #3819

This document explains how humans and future coding/research agents should evolve the Magda v8 AI Agent Platform design.

It is deliberately part of the repository rather than existing only in issue/PR discussion so that a future agent can recover the design method before changing architecture or opening implementation work.

## 1. #3811 is an umbrella design epic

#3811 remains open until the initial v8 blueprint has enough settled cross-component contracts to implement the intended first release without guessing the behaviour of unimplemented components.

#3819 is the long-running working PR for that blueprint.

Do not interpret an individual paragraph in #3819 as implementation authority merely because it exists in the branch. Read the owning detailed design document and its status first.

## 2. The folder structure is a working decomposition

The current files are examples of useful boundaries, not a stone-hard architecture taxonomy.

A design ticket may conclude that:

- two documents should merge;
- one document should split;
- a responsibility belongs to another component;
- an expected component is unnecessary;
- a new cross-cutting aspect needs its own design.

When that happens, change the folder/index and dependency graph. Do not preserve an obsolete decomposition just because it was written first.

## 3. Design maturity

Detailed design documents should start with lightweight metadata:

```text
Status: Draft | Investigating | Proposed | Accepted
Owner ticket: #...
Depends on: ...
Blocks: ...
Evidence: ...
```

Meanings:

- **Draft** — current architecture sketch; important questions remain.
- **Investigating** — design depends on evidence currently being gathered.
- **Proposed** — the contract is coherent and reviewable; no known blocker, but it has not yet passed the design gate.
- **Accepted** — the initial-scope contract is sufficiently settled for dependent implementation/design work.

"Accepted" applies to the documented initial scope; it does not mean the component can never change.

## 4. Design contracts before implementation

A component implementation may begin only when:

1. its own contract for the implementation slice is Accepted; and
2. the input contracts it directly relies on are Accepted for that slice.

This avoids implementing Agent Manager, auth, routing, persistence, etc. against assumptions about components that have not yet been designed.

The whole #3811 blueprint does **not** have to be complete before any implementation can begin. Independent slices may progress once their dependency contracts are settled.

When an implementation must intentionally proceed with an unresolved dependency, the exception must be explicit in the ticket, bounded behind an interface/feature flag, and must not silently turn an assumption into a platform contract.

## 5. Work by dependency graph, not a fixed sequence

The overview maintains a dependency graph.

Use it to answer:

- what must be designed before this component?
- what downstream designs consume this contract?
- what will need reconsideration if this decision changes?

Do not maintain a rigid numbered implementation order in the architecture overview. Detailed findings can reorder the work.

## 6. Evidence-backed design

For each material design question:

```text
question
   |
   +-- enough reliable evidence? -- yes --> decision
   |
   +-- no --> focused experiment / PoC
                         |
                         v
                      evidence
                         |
                         v
                      decision
```

Evidence may include:

- existing Magda code/behaviour;
- upstream project source/docs;
- provider documentation;
- focused local/cloud experiments;
- measurements from an existing PoC such as #3812.

A PoC exists to answer a design question. Feed its findings into the owning detailed design and, when architecture changes, the overview.

Do not leave the experiment result only in an issue comment.

## 7. Keep provider-specific facts scoped

Examples:

- a DSH confinement result observed under Minikube/gVisor is evidence for gVisor, not automatically Kata;
- an EKS/Fargate networking limitation is not a generic Agent Sandbox limitation;
- a GKE-managed feature should not become a required Agent Manager API assumption.

Prefer portable contracts at the Magda component boundary and provider-specific deployment profiles beneath them.

## 8. Design-ticket strategy

Do not create all design tickets at the start.

Create the next tickets when:

- their prerequisites are understood;
- the question is concrete enough to investigate;
- completing them will unblock dependent design or implementation.

If a ticket uncovers a new dependency, update #3811 and the overview. It is acceptable for the blueprint/master plan to change.

Current dependency-critical tickets:

- #3822 — sandbox runtime + session lifecycle;
- #3823 — Agent Manager control-plane contract;
- #3824 — DSH integration / bridge / browser routing;
- #3825 — delegated auth / credential boundaries.

Future tickets for networking, persistence, mutation approval, skills, UI, observability, deployment, etc. should be created incrementally.

## 9. How to use PR #3819

Keep #3819 open as the blueprint working PR while #3811 is active.

For design-ticket work:

1. read this document and the overview;
2. read the owning detailed design and its dependencies;
3. inspect relevant code/upstream evidence;
4. run a focused experiment if needed;
5. update the detailed design;
6. update overview decisions/dependency graph when necessary;
7. update affected dependent design docs/tickets;
8. record remaining uncertainty explicitly.

The PR should remain **Draft** until the #3811 acceptance gate is met.

If parallel work makes one shared branch impractical, temporary branches/PRs may be used, but the accepted result should be integrated back into #3819 before #3811 is closed.

## 10. Avoid duplicated sources of truth

Use:

- **README.md** for cross-component architecture and dependency map;
- **detailed design docs** for component/aspect contracts;
- **investigation docs / PoC tickets** for evidence;
- **#3811** for umbrella tracking and design acceptance;
- **#3819 description** for concise PR status/navigation.

Do not put the full design process only in the PR description: it is too easy for future agents to miss and disappears from the codebase after merge.

Do not put detailed component contracts only in #3811: issue bodies are useful trackers, not the repository's long-term architecture documentation.

## 11. Feedback rule

When a detailed design changes an upstream or cross-component assumption:

- update its own document;
- update the overview;
- identify dependent docs/tickets;
- revise them or mark the affected contract unresolved;
- update the design dependency graph when necessary.

A downstream document must not continue presenting a superseded assumption as accepted.

## 12. What closes #3811

#3811 can close when, for the intended initial v8 release:

- the cross-component architecture and trust boundaries are coherent;
- dependency-critical component/aspect contracts are Accepted;
- implementation tickets can be written without inventing unspecified behaviour in another component;
- material security/lifecycle assumptions are supported by evidence or clearly bounded constraints;
- supported deployment profiles and their provider-specific requirements are explicit;
- remaining work is implementation or intentionally deferred/future design rather than hidden architectural ambiguity.

Future portability work such as #3821 does not have to block #3811 unless it becomes part of the initial support commitment.
