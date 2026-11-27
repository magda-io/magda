# ADR 0014: Translate one caller invoke decision into profile SQL

- **Status:** Accepted; implemented in the #3937 PoC on the v8 development line. Qualification is separate.
- **Related:** [#3838](https://github.com/magda-io/magda/issues/3838), [#3941](https://github.com/magda-io/magda/issues/3941), [#3950](https://github.com/magda-io/magda/issues/3950); requirement EVAL-1.

## Context

One caller may invoke many access profiles. Repeating a full authorization request for each row adds latency and makes pagination, model discovery and request admission difficult to keep consistent. Profiles live in LLM Services' relational database, not the Registry; introducing Registry-shaped records or views solely to reuse authorization translation would duplicate representation.

## Decision

For a non-administrator caller, make **one partial `llm/access/invoke` decision** through `AuthDecisionQueryClient`, with the caller's session and the explicit unknown `input.object.llmAccessProfile`. The profile input is flat, and its authorization field names match columns: `org_unit_id`, `use_permission_id` and `constraint_exemption`.

Use the existing `AuthDecision.toSql({ prefixes: ["input.object.llmAccessProfile"], tableRef: "p" })` translator to produce a parameterised residual condition over `access_profiles p`. An unconditional true selects every otherwise eligible profile; false selects none. The same condition supports admission, model discovery and usage-report eligibility. Profile enabled state, alias coverage and soft quota checks remain in LLM Services; OPA decides authorization, not token budgets.

Verify `whoami` and distinguish Admin Users before treating an unconditional invoke result as ordinary unconstrained access: administrators bypass profiles/quotas, whereas an unconstrained non-administrator grant does not. Cache caller access per user for a bounded TTL (default 30 seconds, configurable 0–30; 0 disables). Profile attributes are not cached with the decision.

Management operations use plain operation decisions, not per-row filters, because every authorized manager may read/manage all profiles (AUTH-3).

## Consequences

- Admission and discovery share authorization semantics without per-profile Auth API calls, custom `AspectQuery` or a SQL view.
- The policy-to-schema field mapping is a deliberate contract. Renaming a column requires a coordinated policy/input/translation change.
- Policies must stay within the supported SQL-translatable residual expression set. Full-policy and residual-SQL equivalence need fixture-based tests for each grant, including deny and administrator cases; this record does not claim those tests were run here.
- Grant, role and org-unit changes may be delayed by the configured caller-cache TTL. Edits to profile attributes affect subsequent queries immediately; running calls are not retroactively revoked.
- Caller state and quota are different concerns. `GET /v1/models` can list an exhausted model, and an unconditional invoke grant must not accidentally become an administrator quota bypass.
- Other-user usage reports must resolve the subject's invoke decision only after authorising the viewer. They must not substitute the viewer's administrator access or use internal credentials to bypass name/email read restrictions.

## Alternatives considered

- **Full decision per profile:** rejected for repeated network cost and inconsistent discovery/admission implementations.
- **Registry-shaped SQL view or custom `AspectQuery`:** rejected because flat field/column names already let the existing translator do the work.
- **Move budgets into OPA or add a bypass operation:** rejected as unnecessary policy/state coupling; administrator role identity is already available from the trusted user lookup.
- **Cache selected profile rows:** rejected because profile changes must affect later requests without waiting for the caller-decision TTL.

## Implementation references

[Caller access resolver](../../../magda-llm-services/src/access/CallerAccess.ts), [admission query](../../../magda-llm-services/src/access/Admission.ts), [LLM policy](../../../magda-opa/policies/llm/access/allow.rego), [schema](../../../magda-migrator-llm-services-db/sql/V1__Initial.sql) and [current architecture](../architecture/llm-services.md).
