# Documentation structure and lifecycle

This guide defines where MAGDA documentation belongs, how to keep a single maintained source of truth, and when a design proposal should become an ADR, architecture reference, user/operator guide or E2E test. Apply it to new features and to older designs when maintaining them.

## Choose the document by its purpose

| Place | Audience / purpose | Expected content and maintenance |
| --- | --- | --- |
| `docs/docs/index.md` | Readers navigating MAGDA documentation | Links to user, operator, architecture, ADR and test entry points; don't duplicate technical contracts |
| `docs/docs/architecture/` | Maintainers, reviewers and coding agents | **Current implemented component contracts**, interfaces, data flows, trust boundaries and operational assumptions; identify the branch/release where the contract applies |
| `docs/docs/*.md` (user/operator guides) | Users, integrators and deployers | Supported workflows, procedures and troubleshooting with commands or examples checked against the implementation |
| `docs/docs/adrs/` | Future architectural reviewers | **Why a consequential decision was made**, with context, alternatives, status and consequences. One decision per ADR; link to current architecture and public implementation PRs |
| `docs/docs/e2e-test-cases/` | QA, operators and coding agents | Reproducible prerequisites, steps, positive/negative expected results, test fixtures, cleanup and a distinction between *expected*, *observed* and *not yet tested* |
| `docs/design/` | Feature designers and implementers | **Open, unimplemented proposals** with explicit owner, scope, implementation status and unresolved choices; do not claim proposed behaviour is available |
| `docs/investigations/` | Researchers and platform engineers | Dated experiments, limitations, measured results, exploratory alternatives and environment-specific evidence; they do not alone establish a supported feature |
| Source code, schemas, tests and generated API references | Developers and machines | Normative **executable** interfaces (e.g. JSON Schemas, types, API implementations, fixtures). Prose references must not contradict them |

Complex, stable public schemas can have long-form technical specifications in `docs/docs/` when a short operator guide is insufficient. Such specifications explain the implemented compatibility envelope and link to the authoritative schema/validators. **Do not copy a 1,000-line design document into an ADR.**

## Track decisions and implementation as separate dimensions

- **Proposed:** a candidate design or enhancement; put it in `docs/design/`, link an owning issue, and explicitly describe what is unimplemented.
- **Accepted decision:** record a consequential, non-obvious choice as an **Accepted ADR**, even if the code will arrive later; note the actual implementation state separately.
- **Implemented:** update the maintained architecture/API/user/operation docs and relevant E2E expectations **in the same PR as the implementation**. Link the accepted ADR(s), if any, and mark unsupported paths accurately.
- **Qualified:** security, provider compatibility and high-risk product behaviour need **observed** acceptance evidence. A successful build or merged feature PR does not prove external cloud policies, IAM or qualitative agent behaviour.
- **Released:** document the actual released version separately from implementation on `next` or another development branch. Merged-to-development does not automatically mean released.
- **Superseded/retired:** if a decision changes, add a new ADR superseding the old one; retain the old decision for historical explanation. Retire proposals/working designs once their useful content is reconciled.

These are **not** interchangeable statuses: an ADR may be Accepted while its implementation is still pending, and a feature may be implemented without being qualified or released.

## When to write an ADR

Write an ADR when future engineers will reasonably ask *why did we choose this?*: security/authorization boundaries; an expensive-to-reverse persistence or API choice; a cross-component interface; a consequential data contract; or a deliberate rejection of a viable alternative. Use `NNNN-short-title.md`, following the [ADR format and index](./adrs/README.md).

**Do not create an ADR automatically for every merged feature, component, JSON property, code fix, workflow or E2E scenario.** Details of *how it works today* belong in architecture and executable schemas; *how to use it* belongs in guides; *how to prove it* belongs in tests.

## What to do when a design is implemented

1. Compare the **actual merged code and tests** with the proposal; identify implemented core, partial/deferred work, and discarded ideas.
2. Update the canonical component architecture, data reference, operations/user guidance and E2E expectations. Link code, schemas and examples.
3. Extract only the **significant rationales and trade-offs** into ADRs; don't restate the entire specification.
4. Close or narrow implementation tickets independently of any unresolved qualification or future extensions. Mark proposed vs implemented vs tested clearly.
5. Once useful content is captured, remove the duplicate draft from `docs/design/`, archive it when genuine historical value remains, or keep a **clearly labelled transitional historical design** if moving would break many current links. Do not keep an unlabeled `Proposed` page after implementation.
6. Update links and the documentation index. Avoid permanent links to short-lived design branches or private evidence. Preserve Git history for historical context.

**Legacy exception requiring later migration:** the long [Data Dictionary design](../design/data-dictionary-design.md) and [Distribution Contract design](../design/distribution-contract-design.md) currently have many established schema/test/issue links and mix implemented contract descriptions with future automatic-producer work. Their **v7 core is already implemented** in [#3820](https://github.com/magda-io/magda/pull/3820) and [#3828](https://github.com/magda-io/magda/pull/3828), while [#3813](https://github.com/magda-io/magda/issues/3813) and [#3814](https://github.com/magda-io/magda/issues/3814) remain open. They are temporarily preserved at stable paths, explicitly marked as historical implementation-era design plus pending extension proposals. The authoritative executable contracts are the built-in JSON Schemas, typed validators and tests; the maintained usage guides are [Data Dictionary](./data-dictionary.md) and [Distribution Contract](./distribution-contract.md). Do not treat every automatic producer/example in those designs as already shipped. Later migration into a maintained technical reference and/or archival location is fine, provided links are updated deliberately.

The [Data Understanding Layer design](../design/data-understanding-layer-design.md) similarly covers the broader architectural direction and deferred extensions; [dataset usage](../design/dataset-usage-design.md) remains explicitly deferred. Refer to [ADRs 0010–0011](./adrs/README.md) for why the v7 core uses separate descriptive aspects with provenance-aware validation.

## Documentation PR checklist

- [ ] Check status against the merged target branch and supported **release**, not merely the PR's historical title.
- [ ] Identify the canonical current-behaviour page; add no duplicate authoritative description.
- [ ] Record consequential decisions/alternatives in an ADR, **only if warranted**.
- [ ] Update executable schemas, code comments and E2E cases for changed contracts.
- [ ] Distinguish user guidance from technically enforced authorization/approval.
- [ ] Distinguish provider qualification from installed Helm template or PoC evidence.
- [ ] Update `docs/docs/index.md`, topical indexes and relative links; avoid dead links to deleted design docs.
- [ ] Use only public/releasable examples and links; no private demonstration repositories, personal credentials, private server URLs or unpublished evidence.
- [ ] Verify generated docs/link checks where available, and report what was **not** tested.
