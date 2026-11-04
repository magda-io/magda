# ADR 0008: Model-mediated Agent Skill publication consent in the MVP

- **Status:** Accepted for MVP (merged #3850); security caveat remains
- **Date:** 2026-11-04 (documented after implementation)
- **Related:** [#3856](https://github.com/magda-io/magda/issues/3856), [#3850](https://github.com/magda-io/magda/pull/3850), [#3866](https://github.com/magda-io/magda/issues/3866)

## Context

Users should review a captured workflow as a draft and publish after one meaningful approval, without needing an additional prompt if they clearly consented in chat. A model can misunderstand approval or be influenced by untrusted documents.

## Decision

The trusted DSH publication tool accepts `userApproved: true` as the model's **assertion** that this specific reviewed draft has already been approved by the user. Otherwise the same tool call displays a DSH Publish/Cancel question card and only continues on Publish. A declined, dismissed or incomplete question leaves the draft unpublished. Do not expose raw privileged writes through an untrusted Bash shortcut.

Do **not** describe the model assertion as independently verified consent. The MVP does not implement an NLP confirmation interpreter, signed user-approval artifact, persistent approval audit record or cryptographic consent boundary. Normal Agent Services typed authorization still applies.

## Consequences

- The common interaction needs one approval, preserving the agent-led workflow.
- Prompt injection or conversational misinterpretation remains a real residual risk, even if permission checks succeed.
- User tests must verify that compliments, file contents and the agent's own suggestion do not count as approval.
- A higher-assurance future UX can require a UI-originated approval record without claiming it is already enforced.

## Alternatives considered

A mandatory second approval after any chat consent; replaying history to classify approval; signed consent tokens; durable approval services. These were deferred to avoid expanding MVP UX and infrastructure, *not* because they are equivalent in assurance.

## Verification

See [Agent Skills architecture, publication approval](../architecture/agent-skills.md#one-approval-for-publishing), [Workspace security](../architecture/agent-workspace-security.md) and [capture E2E](../e2e-test-cases/agent-workspace.md#workflow-capture-checks).
