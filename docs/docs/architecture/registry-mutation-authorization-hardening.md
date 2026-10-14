# Registry mutation authorization hardening design investigation

Tracking issue: [#3862](https://github.com/magda-io/magda/issues/3862)

Status: draft design plus reviewable prototype implementation; not ready to merge until compatibility and performance work is complete.

## Context

Registry authorization commonly evaluates a record state through `object/record/*` OPA operations. Review of typed Agent Skill records highlighted a broader question: some generic update, aspect, bulk, and trimming routes can transform records without exposing a consistent current-and-proposed mutation context to policy.

This is not specific to Agent Skills. Dataset, distribution, organization, access-group, and custom typed records may depend on similar ownership, type, and immutable-metadata rules. Any Registry-wide change therefore needs separate security, compatibility, and performance review.

Agent Skill-specific business rules remain in Agent Services and its typed OPA policy. This investigation does not add an Agent Skill source-trimming exclusion or other type-specific Registry behavior.

## Prototype included in this draft PR

This branch carries the generic Registry implementation originally developed in
[#3850](https://github.com/magda-io/magda/pull/3850), so it can be reviewed and
benchmarked independently instead of being discarded. The prototype currently:

- includes the trusted current record as `input.object.originalRecord` on the
  proposed-state authorization decision for single record and aspect updates and
  aspect deletion;
- performs current- and proposed-state authorization for every requested record
  before bulk record patch, bulk aspect PUT, and bulk aspect-array-item deletion;
- preserves the existing bulk authorization decision used by persistence after
  all per-record checks pass, so a denial occurs before the mutation transaction;
- loads each authorization record and its aspects in one database session and
  binds both queries to the same tenant, including when record IDs overlap across
  tenants;
- adds tests proving a denied proposed state leaves the stored records unchanged
  and authorization contexts do not mix same-ID records across tenants;
- adds a FIFO decision facility to the Registry authorization test double so the
  same operation can return distinct current- and proposed-state decisions.

The prototype deliberately leaves source trimming unchanged and contains no
record-type-specific Registry production logic. In particular, it does not carry
the former Agent Skill source-trimming exclusion.

This is intentionally reviewable code rather than an accepted final design. It
must not be treated as complete invariant enforcement: bundled policies do not
yet consume `originalRecord`, and policy dispatch for a removed type marker still
needs an explicit design. Additional known blockers and compatibility concerns
include:

- serial per-record database and OPA round trips (`2N` state decisions plus the
  existing final bulk decision), changed decision order, larger policy inputs,
  and no agreed batch cap or timeout budget;
- a time-of-check/time-of-use window because authorization completes before the
  mutation transaction; concurrent writes can invalidate the authorized states;
- proposed-state construction that must be checked against persistence semantics,
  including omitted `sourceTag`, generated `lastUpdate`, merge behavior, missing
  aspects, and invalid/no-op patch paths;
- changed missing-record and error-order behavior that may expose a `400` before
  the former bulk decision or reveal patch-shape errors before permission denial;
- unproven rollback behavior when persistence succeeds for an early bulk item but
  a later item fails for a non-authorization reason.

The benchmarks, policy adoption, state-parity work, concurrency strategy, caller
inventory, and multi-record rollback tests below determine whether this
implementation should be optimized, feature-gated, revised, or replaced before
the PR is made ready for merge.

## Problem statements

### Cross-version invariants

A policy can validate the state it receives, but invariants such as “owner cannot change,” “type marker cannot be removed,” or “creation identity is immutable” require trustworthy current and proposed state. Optional caller-provided context is not a security boundary.

### Typed-policy dispatch

A proposed record can add or remove the aspect that selects a typed resource policy. Authorization must define which policy applies to the current state, the proposed state, and the transition itself. Falling through to a generic record grant after removing a type marker may be unsafe for some resources.

### Bulk mutation semantics

Bulk routes can affect many heterogeneous records. Loading every current record and issuing multiple OPA decisions per item offers straightforward semantics but may significantly increase database queries, OPA traffic, latency, and contention.

### Source trimming

Source-based deletion can remove many records indirectly. If it needs stronger authorization, the solution should be generic and should not exempt or special-case individual record types.

## Routes to inventory

The investigation should map authorization and persistence behavior for:

- single-record `PUT` and `PATCH`;
- aspect `PUT`, `PATCH`, and `DELETE`;
- bulk record patch;
- bulk aspect upsert/update;
- aspect array-item deletion;
- source-based trimming/deletion;
- any internal callers of the same persistence methods.

For each route, record:

- current OPA operation and input shape;
- database reads before authorization;
- whether current and proposed state are available;
- atomicity and partial-failure semantics;
- known callers and typical/maximum batch sizes.

## Existing callers and compatibility

At minimum, assess:

- dataset and distribution publishing/update flows;
- access-control and access-group mutation flows;
- harvesters, minions, connectors, and source trimming;
- administrative bulk tooling;
- deployments with custom `object/record` policies.

Additional OPA input fields are usually backward compatible for policies that ignore them, but altered decision count, order, operation URI, or failure semantics may not be. Custom policies may also rely on current generic-policy dispatch behavior.

## Candidate approaches

### 1. Current and proposed record decisions

Load current records, construct proposed states, and authorize both states plus any transition invariants.

Advantages:

- explicit semantics;
- expressive OPA rules;
- uniform treatment of typed resources.

Risks:

- per-record database reads and OPA decisions;
- larger payloads;
- high tail latency for large batches;
- time-of-check/time-of-use concerns unless integrated with transaction boundaries.

Potential optimizations include batched current-record loading and batched OPA evaluation.

### 2. Generic mutation-plan authorization

Build a normalized mutation plan containing affected IDs, relevant current metadata, proposed changes, and operation class, then authorize the plan once or in bounded batches.

Advantages:

- fewer network round trips;
- policy can reason about batch-wide constraints.

Risks:

- new policy contract;
- larger and more complex policy logic;
- payload-size limits;
- harder per-item diagnostics and compatibility.

### 3. Registry-enforced immutable fields

Introduce generic aspect-schema metadata or Registry configuration that declares immutable paths/type markers.

Advantages:

- efficient enforcement close to persistence;
- avoids repeated OPA logic for simple invariants.

Risks:

- schema/Registry contract expansion;
- migration and backward-compatibility complexity;
- does not replace contextual authorization.

### 4. Restrict unsafe generic mutations for typed records

Require a typed resource policy to explicitly opt into bulk/marker-changing operations, or reject unsupported transformations.

Advantages:

- fail-closed model;
- potentially simpler and cheaper than reconstructing every proposed record.

Risks:

- may break existing callers;
- requires a reliable type-classification contract;
- can reduce generic Registry utility.

### 5. Service-owned invariants with documented trust boundaries

Keep Registry authorization state-based and require owning services to enforce cross-version business rules, while documenting that separately authorized direct Registry callers are trusted to preserve them.

Advantages:

- no Registry performance regression;
- clear service ownership.

Risks:

- direct and bulk Registry mutation can bypass service invariants;
- integrity depends on permission governance and operational discipline.

A final design may combine these approaches by route and invariant.

## Performance evaluation

Benchmark current behavior and each viable candidate with representative records and OPA policies.

### Workloads

- single-record updates;
- aspect updates;
- homogeneous batches of 10, 100, 1,000, and an agreed upper-bound size;
- heterogeneous typed records;
- source trimming with small and large affected sets;
- allowed, denied, and mixed-decision batches.

### Metrics

- database query count and rows loaded;
- OPA request/decision count;
- OPA payload bytes;
- Registry throughput;
- median, p95, and p99 latency;
- transaction duration and lock contention;
- memory and CPU utilization;
- failure/rollback behavior.

Benchmark both local PostgreSQL/OPA and a representative Kubernetes deployment. Include a high-latency OPA scenario because network round trips may dominate per-record decisions.

## Security evaluation

Test at least:

- owner transfer;
- type-marker addition/removal;
- immutable identity/audit metadata changes;
- a typed record carrying multiple marker aspects;
- generic permission fallback;
- partial denial in a batch;
- concurrent mutation between authorization and persistence;
- source trimming across records with different permissions.

## Decision criteria

The recommended design should:

1. define authorization semantics consistently for every affected route;
2. avoid resource-specific special cases in Registry;
3. provide measurable security improvement;
4. keep large-batch overhead within an agreed budget;
5. preserve or explicitly migrate existing callers and custom policies;
6. define atomicity, diagnostics, rollout, and fallback behavior.

## Next steps

1. Complete the route and caller inventory.
2. Capture baseline query/OPA behavior and benchmark the included prototype.
3. Make proposed-state construction exactly match persistence and define a
   transaction/versioning strategy for concurrent changes.
4. Add multi-record rollback, concurrency, large-batch, mixed-decision, and
   custom-policy compatibility coverage.
5. Design and test the policy rollout that consumes `originalRecord`, including
   typed-marker removal and generic-policy fallback.
6. Compare the prototype with batched authorization and other viable candidates.
7. Review security, performance, and compatibility results before making this PR
   ready for merge.
