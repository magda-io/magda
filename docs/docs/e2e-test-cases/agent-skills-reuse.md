# Agent Skill capture, reuse and evolving domain rules E2E

**Purpose:** Product-level acceptance for [#3866](https://github.com/magda-io/magda/issues/3866), complementing [technical workflow-capture checks](./agent-workspace.md#workflow-capture-checks). This test is **not** satisfied merely by a successful `mgd agent-skill publish` or a promotional video.

## Fixture contract (public-safe, reproducible)

Create **three** deterministic, fictional exports (e.g. accepted delivery weights by grower/produce) with different schemas, aliases, statuses, tare rules, linked returns and exceptions. Provide a generator seed, fixture checksums, versioned import steps, an independent verification script and expected **row-level** decisions, counts, group totals and unresolved rows. Do not embed presenter-only domain facts in agent-visible inputs, prompts, SKILL.md or seeded catalogue descriptions. Do not publish real client data, identities, tokens or internal URLs.

Maintain a separate reviewer-only rule sheet covering ambiguous aliases, missing fields, statuses, returns, trial records and when to **ask rather than guess**. The verifier must not trust agent-produced explanations or its own generated code as the oracle. Label any example numbers as illustrative unless actually reproduced.

## Procedure

1. **Fresh state:** seed cycle 1 as MAGDA datasets; verify `mgd` is discoverable from built-in agent guidance. Start a clean Workspace; record image/build and available skill manifest. Ask naturally for the reconciliation, without `mgd`-specific instructions.
2. **First-pass judgment:** capture the agent's first attempt and any incorrect assumptions. The reviewer supplies **only** appropriate withheld domain decisions. Verify the corrected final output independently: every input row has the correct treatment, matched references, reason and totals. Require an explicit unresolved list; never silently collapse distinct ambiguous growers.
3. **Capture and consent:** request a reusable skill describing inputs, variables, assumptions, clarifying questions, exclusions, QA and failure states. Verify no sample totals, fixed dataset IDs, credentials or transcript were hard-coded. Review proposed content. Test **Cancel/no approval** leaves no publication; then explicitly approve a reviewed draft and record publication ID/checksum.
4. **Complete reset:** terminate/reset the Workspace and confirm previous local scripts, chats, drafts and environments are gone. Seed cycle 2 with altered column names/status semantics; create a fresh claim, sync the published skill and ask a natural request. Check it asks specifically about changed/ambiguous values and reproduces oracle row decisions, not simply memorised totals.
5. **Evolution:** introduce one new rule/exception in cycle 2. Review proposed skill changes, explicitly approve replacement, record the same publication ID with changed checksum, and verify the next manifest/version.
6. **Third cycle:** completely reset and seed cycle 3; verify the agent retains settled rules, asks only targeted new questions and produces independently checked outputs. Confirm unknowns still stop or require review rather than being silently invented.
7. **Negative paths:** unauthorised skill read, archive unavailable, invalid/stale checksum, forced sync conflict, unavailable data source, unapproved mutation and model variability. Confirm Workspace READY need not wait for optional skill sync; failures remain observable.

## Acceptance matrix

| Criterion | Type of check | Required evidence |
| --- | --- | --- |
| Natural MAGDA discovery | Behavioural + observed operations | Actual dataset discovery without explicit CLI steering |
| Correct reconciled result | **Deterministic** | Oracle row decisions, totals, exception reasons, hashes |
| Questions / expert decisions | Qualitative rubric | What was unknown, what the agent asked, what was corrected |
| Generalised skill | Structural + reviewer | Draft/ZIP diff, no sensitive/fixed data, variables and QA |
| User publication approval | Behavioural + Registry | Explicit approval and rejected/cancelled branch |
| Persistence over resets | Lifecycle + checksum | New claim, empty old session state, installed skill revision |
| Safe evolution | Deterministic + reviewer | New exception handled, earlier rules preserved |
| Failure recovery | API + observable UI | Clear skip/failure/partial and no silent unsafe publication |

**Pass rule:** deterministic output and authorization requirements must pass. Qualitative checks need recorded rubric decisions and reviewer sign-off; variation in wording is permitted, not fabricated success. Report **untested** items separately from passed ones.

## Report and cleanup

Use a table `Case | Build | Fixture hash | Expected | Observed | Pass/Fail/Untested | Evidence`. Record sanitized session/publication IDs as necessary, document model variability, remove synthetic datasets/skills/PVCs and preserve only authorised shareable fixtures. Link public issues for product defects.
