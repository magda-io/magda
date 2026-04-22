## Scala Authorisation Layer: Semantic Search filtering

## Objective

Finalise the authorisation layer so that semantic search results are correctly filtered based on user permissions. This ensures that dataset access is governed consistently across all user types, and that unauthorised users receive clear, informative UI feedback rather than silent exclusion or system errors.

The authorisation layer is implemented in Scala (magda-authorisation-api), which enforces OPA policy decisions. The search API (magda-search-api-node, Node.js/TypeScript) integrates with this Scala authorisation service to filter search results based on those decisions.

## Milestone

Agile Cycle 2, Week 6-8: Core Functionality Integration

## Acceptance Criteria

- The authorisation layer correctly filters search results based on OPA policy decisions
- Unauthorised users cannot access restricted datasets, and are shown a clear consistent UI message
- Authorised users see only datasets they have permission to view
- All four use cases (UC1-UC4) pass manual and automated testing before the feature is merged

## Tech Stack Context

Per the original project tech stack:

- **Scala** - used for core MAGDA backend services including authorisation. 'magda-authorisation-api' is the Scala service that proxies all OPA policy decisions with user context pre-filled.

- **Node.js/TypeScript** - Used for most backend services including 'magda-search-api-node', which calls the Scala authorisation service during search to enforce access decisions

- **Rego** - OPA policy language used to define access rules, language-agnostic and evaluated by the OPA sidecar container running alongside 'magda-authorization-api'

## Current State of the Authorisation Layer

### What Exists (Currently there)

The following components are already in place and provide the foundation for this milestone

- 'magda-opa/policies/entrypoint/allow.rego'
  Full path: 'magda/magda-opa/policies/entrypoint/allow.rego'
  Central OPA entrypoint that delegates decisions to resource-specific policy files. Admin bypass (role ID 00000000-0000-0003-0000-000000000000) is handled here. Must not be modified for this milestone

- 'magda-opa/policies/object/dataset/allow.rego'
  Full path: 'magda/magda-opa/policies/object/dataset/allow.rego'
  Dataset-specific policy that delegates to verifyPermission, which calls verifyRecordWithPublishingStatusPermission from data.common.

- 'magda-opa/policies/object/dataset/hasAnyPublishedReadPermission.rego'
  Full path: 'magda/magda-opa/policies/object/dataset/hasAnyPublishedReadPermission.rego'
  Handles published dataset read permission checks. Extended in this milestone to add ownership-constrained and pre-authorised access rules for semantic search context.

- 'magda-opa/policies/object/dataset/hasAnyDraftReadPermission.rego'
  Full path: 'magda/magda-opa/policies/object/dataset/hasAnyDraftReadPermission.rego'
  Handles draft dataset read permission checks. Used as the reference pattern for implementing published read constraint rules.

- 'magda-authorization-api/src/'
  Full path: 'magda/magda-authorization-api/src/'
  Scala authorization service that proxies all OPA decision requests with user context (JWT, roles, permissions) pre-filled via the X-Magda-Session header.

- 'magda-search-api-node/src/createApiRouter.ts'
  Full path: 'magda/magda-search-api-node/src/createApiRouter.ts'
  Node.js/TypeScript search API router. Requires integration with magda-authorization-api to enforce OPA decisions on search results before returning them to the frontend.

- 'magda-web-client/src/Components/Dataset/Search/'
  Full path:'magda/magda-web-client/src/Components/Dataset/Search/'
  Frontend search results components. Requires new RestrictedAccessMessage.tsx component wired into the results list to display the inline unauthorised message.

### Architecture Auth Decision Flow

The following describes how an authorised search request flows through the system: 1. User performs semantic search -> request hits 'magda-gateway' 2. Gateway forwards JWT session token in 'X-Magda-Session' header 3. 'magda-search-api-node' receives search request 4. For each dataset result, search API calls 'magda-authorization-api' with operationUri 'object/dataset/published/read' and user context 5. 'magda-authorization-api' (Scala) proxies decision to OPA sidecar 6. OPA evaluates 'entrypoint/allow.rego' -> delegates to 'object/dataset/allow.rego' -> evaluates 'hasAnyPublishedReadPermission' 7. OPA returns allow/deny decision 8. Search API flags restricted results with '{ "restricted":true }' and no metadata in the response 9. 'magda-web-client' renders 'RestrictedAccessMessage' inline for each flagged result

    Anonymous users (UC3) carry no JWT token and are treated as the built-in Anonymous role, which has no published/read permission by default, no special handling required in the search API.

### What is Missing

- Search results are not currently filtered based on auth decisions
  - https://openpolicyagent.org/docs/filtering/partial-evaluation
- No integration between the search API and the authorizaion API
  - https://www.openpolicyagent.org/docs#running-opa
- No UI message shown to users when a dataset is restricted
  - https://owasp.org/www-project-top-ten/
- hasAnyPublishedReadPermission.rego lacked ownership-constrained and pre-authorised access rules for semantic search context.

### Gaps to fill

- **OPA rules incomplete for dataset access**

  - Where to fix: 'magda-opa/policies/object/dataset/hasAnyPublishedReadPermission.rego'
  - Reference: https://www.openpolicyagent.org/docs/policy-language

- **Search results not filtered by auth**

  - Where to fix: 'magda-search-api-node/src/createApiRouter.ts'
  - Reference: https://opensearch.org/docs/latest/search-plugins

- **Auth API not being called during search**

  - Where to fix: 'magda-search-api-node/src/createApiRouter.ts'
  - Reference: https://magda.io/docs/using-api.html

- **No unauthorised message in UI**
  - Where to fix: 'magda-web-client/src/Components/Common/RestrictedAccessMessage.tsx'
  - Reference: https://owasp.org/Top10/2021/A01_2021-Broken_Access_Control/index.html

### Unauthorised Access UI Specification

The following defines how the UI must behave when a user is blocked from accessing a restricted dataset: - The message must appear inline within the search results panel, in place of the dataset card that would otherwise be shown - The exact display string is: "You are not authorised to access this dataset." - Styling must use muted text colour consistent with the existing component design system, error-red colouring must not be used, to avoid implying a system fault - The message must not reveal why the dataset is restricted or expose any metadata about the restricted dataset to the requesting user. - Layout of the results list must be maintained, the inline message preserves the card spacing so the page does not reflow unexpectedly. - https://owasp.org/www-project-top-ten/

### Design Decisions

**Why ownership and pre-authorised constraints were added to 'hasAnyPublishedReadPermission.rego' rather than 'entrypoint/allow.rego'** - The entry point follows a strict delegation pattern, it contains no resource-specific logic, only routing to the appropriate policy file. Adding dataset access logic there would break architectural consistency and create a maintenance risk. The correct location per the existing codebase pattern is the resource-specific policy file, confirmed by examining 'hasAnyDraftReadPermission.rego' as a reference.

**Why flag restricted results rather than silently drop them (UC2)** - Silently dropping restricted results satisfies UC3 (unauthenticated users) but violates UC2, which requires the UI display an inline message in place of each excluded dataset card. The search API therefore returns restricted results with a '{ "restricted": true }' marker and no metadata, allowing the frontend to render the placeholder message while preserving layout spacing.

**Why muted text colour rather than error-red for the UI message** - Error-red colouring implies a system fault. A restricted dataset is an expected, intentional access control outcome - not an error. Muted text colour communicates this without alarming the user, consistent with OWASP A01:2021 Broken Access Control - avoid exposing unnecessary system information

### Testing Plan

## Strategy

A combination of manual scenario-based testing and automated unit/integration tests will be used before software development is considered complete: - Unit tests will cover hasAnyPublishedReadPermission.rego policy rules, asserting correct allow/deny decisions for each role and dataset type. - Integration tests will verify that the search API correctly calls the auth API and applies the response to filter results. - Manual scenario testing will walk through UC1-UC4 end-to-end in a local development environment to confirm UI behaviour before merge. - UC1 (authorised) and UC2 (unauthorised) are the highest priority scenarios and will be tested first, as they represent the core access-control boundary

### OPA Backend Tests

File: 'magda-opa/policies/object/dataset/hasAnyPublishedReadPermission_test.rego'

**test_hasAnyPublishedReadPermission_owner_can_read**

- Description: Owner can read own dataset
- UC Coverage: UC1

**test_hasAnyPublishedReadPermission_non_owner_cannot_read**

- Description: Non-owner is blocked
- UC Coverage: UC2

### Frontend Tests

**test_RestrictedAccessMessage_renders_unauthorised_message**

- Description: Component renders inline message when restricted: true is received from the search API
- UC Coverage: UC2

**test_RestrictedAccessMessage_does_not_render_when_authorised**

- Description: Component does not render when dataset is accessible
- UC Coverage: UC1

### Follow-up Actions

- If any OPA test fails: review constraint logic in 'hasAnyPublishedReadPermission.rego' before proceeding to search API integration
- If search API integration test fails: verify JWT token is correctly forwarded in 'X-Magda-Session' header
- If UI message does not appear: verify search API response shape includes 'restricted: true' flag for blocked datasets

### Scenarios

| Scenario                        | Input                                        | Expected Output                                        |
| ------------------------------- | -------------------------------------------- | ------------------------------------------------------ |
| Authorised User Searches        | Valid role + restricted dataset as index     | Restricted dataset appears in results                  |
| ------------------------------- | -------------------------------------------- | ------------------------------------------------------ |
| Unauthorised user searches      | Role lacking permission + restricted dataset | Dataset excluded; inline UI message shown in its place |
| Unauthorised user searches      | No session token                             | Only public datasets returned; no message shown        |
| Admin user searches             | Admin role                                   | All datasets returned regardless of restrictions       |

## Use Cases to Implement

### UC1: Authorised User Sees Filtered Search Results

- User is authenticated with correct role
- Performs a semantic search
- Only datasets they have permission to view are returned

### UC2: Unauthorised User is Blocked and Informed

- User is authenticated but lacks required role
- Performs a semantic search
- Restricted datasets are excluded from results
- UI displays "You are not authorised to access this dataset." inline in place of each excluded dataset card

### UC3: Unauthenticated User Only Sees Public Data

- User is not logged in
- Performs a semantic search
- Only public datasets are returned, no restricted data is exposed
- Note: Covered by existing 'default allow = false' in 'entrypoint/allow.rego', Search API integration in 'createApiRouter.ts' must correctly forward the absence of a JWT token to the auth API

### UC4: Admin Bypasses All Restrictions

- User is authenticated as admin
- Performs a semantic search
- All datasets returned regardless of access restrictions
- Note: OPA policy handled by existing admin role bypass in 'entrypoint/allow.rego'. Search API integration in 'createApiRouter.ts' must correctly forward the admin JWT token to the auth API

## Milestone mapping

- "Finalise the Scala-based authorisation layer for semantic search" (UC1, UC2, UC3)
- "The Scala Authorisation layer correctly filters search results"
  - Acceptance criteria met when all four use cases pass testing described above
