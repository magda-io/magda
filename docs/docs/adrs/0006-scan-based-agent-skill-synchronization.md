# ADR 0006: Scan-based, independently recoverable Agent Skill synchronization

- **Status:** Accepted (merged #3850/#3864)
- **Date:** 2026-11-04 (documented after implementation)
- **Related:** [#3855](https://github.com/magda-io/magda/issues/3855), [#3850](https://github.com/magda-io/magda/pull/3850), [#3864](https://github.com/magda-io/magda/pull/3864)

## Context

One user's skills can be projected into DSH on a managed Sandbox and into multiple independent desktop coding harnesses. A successful publication does not imply the user's local files or disconnected tools are current. A global transactional install journal across different tool roots is difficult to recover and can damage unrelated local edits.

## Decision

Use an authoritative, caller-scoped remote manifest plus a scan of each harness root. A managed installation is a **real directory copy** containing a self-contained `.magda-skill-install.json` provenance/baseline marker. Account-isolated verified caches store remote source snapshots; no global installation index, multi-harness transaction journal or all-roots rollback is required.

Verify the complete remote desired source set before reconciling locally. If authentication/Registry/Storage/OPA fails, preserve old copies rather than mistaking an outage for an empty manifest. On success, reconcile each skill/harness independently; protect changed contents unless the user explicitly chooses force. Workspace readiness must not depend on optional sync.

## Consequences

- Individual local conflicts can be reported without blocking unrelated installs or DSH access.
- Crash recovery is by rescanning actual state; each managed directory has provenance.
- Copies may outlive source revocation while offline, until a subsequent successful sync; force may discard local edits.
- Active profile selection commits before reconciliation rather than rolling back as an impossible multi-harness transaction.

## Alternatives considered

Symlinks, an installation database, a global mutable index, two-phase cross-harness journal/rollback, and automatically overwriting locally edited skills were rejected as unnecessarily brittle.

## Verification

See [sync contract](../architecture/agent-skills-sync.md), [Agent Skills architecture](../architecture/agent-skills.md) and [recovery/sharing E2E](../e2e-test-cases/agent-skills-sharing.md).
