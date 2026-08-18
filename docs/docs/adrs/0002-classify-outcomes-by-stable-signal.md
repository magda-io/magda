# 0002 — Classify outcomes by a stable signal, not by a tool's output text

## Status

Accepted.

## Context

Several places in Magda decide whether an external tool succeeded — or which
kind of failure occurred — by matching that tool's **human-readable output**.
Three real examples, all in database/backup plumbing:

- The DB migrator classified a `psql` failure as "object simply missing"
  (benign) vs. "could not talk to the DB" (fatal) by grepping stderr for the
  English `... does not exist`.
- The DB migrator would have surfaced a PostgreSQL 15+ `public`-schema privilege
  failure as a raw error (easily misread as a TLS/CA problem) by looking at the
  message text `permission denied for schema public`.
- The `magda-postgres` backup CronJob decided whether `wal-g delete ... retain FULL N` did anything by matching the **last 9 characters** of wal-g's output
  against `not found`.

This is fragile for reasons that are easy to miss until they bite in production:

- **Localization.** PostgreSQL localizes server messages via `lc_messages`, a
  server-side GUC an operator can set to a non-English locale (managed providers
  allow this). The message the client receives is then translated and an
  English match silently misses.
- **Version / fork drift.** Output wording is not a stability guarantee. Magda's
  v7 wal-g is a forked, major-bumped build whose benign empty-delete now prints
  `No backup found for deletion` — which no longer ends in `not found`, so the
  old suffix match reads a benign result as a failure.
- **Positional/substring matches are especially brittle** (`${OUT: -9}`,
  "ends with X"): any trailing whitespace, punctuation or newline change flips
  the branch.

And both failure directions are silent: a benign result misreported as an error
(noise that trains operators to ignore the message), or a real error misread as
benign (silent data/retention loss).

## Decision

**Do not decide a program's success/failure — or which kind of failure — by
matching its human-readable output.** Decide from a stable, machine-readable
signal instead:

- an **error code** — a PostgreSQL **SQLSTATE**, an HTTP status, a documented
  process exit code; or
- the **actual state** — a catalog query, a count, a structured (`--json`)
  listing —

so that a non-zero exit is _unambiguous_ and the classification does not depend
on prose. Prefer establishing the state up front (so the tool is only invoked
when it should succeed) over interpreting an error after the fact.

Each site that must distinguish outcomes this way should add a test that fails
if the logic regresses to prose-matching.

## Consequences

- Classification is robust to server locale, tool version and fork changes, and
  to cosmetic output changes.
- Slightly more work per site (a catalog/count probe, or knowing the relevant
  SQLSTATE) — but it is local, tool-specific work; see "Alternatives" for why it
  is not centralized.

## Where this is applied

Keep this list in sync; add new sites here.

- `magda-db-migrator/migrate.sh` — `run_scalar`: database existence via the
  `pg_database` catalog, not the localized `... does not exist` text
  ([#3744](https://github.com/magda-io/magda/issues/3744)).
- `magda-db-migrator/migrate.sh` — `run_flyway`: detect the PG15+ public-schema
  failure by **SQLSTATE `42501`**, not `permission denied for schema public`
  text ([#3770](https://github.com/magda-io/magda/issues/3770)).
- `deploy/helm/internal-charts/magda-postgres/templates/cronjob-backup.yaml` —
  backup retention decided by the **backup count** (`wal-g backup-list`), not
  wal-g's `not found` output suffix
  ([#3763](https://github.com/magda-io/magda/issues/3763)).

Enforcing tests: `magda-db-migrator/tests/migrate-idempotency.sh` (cases 4/5)
and `deploy/helm/magda-core/tests/walg-backup-cronjob.sh` (cases C/D/E).

## Alternatives considered

- **A shared helper library across the sites.** Rejected: the sites live in
  different images with no shared runtime (the migrator's `migrate.sh` vs. the
  wal-g image's rendered CronJob script), and the mechanisms are tool-specific
  (a `pg_database` catalog query, a Flyway SQLSTATE, a `wal-g backup-list`
  count) rather than a common algorithm — two of them are even opposites (one
  avoids parsing entirely; the other parses a stable code). Factoring a shared
  helper would couple unrelated images for no real reuse. The durable
  consolidation is this convention plus the per-site tests, not shared code.
- **Keep matching text but make it more robust** (match more of the message,
  treat "unrecognised output + non-zero exit" as an error). Better than a
  9-character suffix, but still tied to prose that a locale or version can
  change; used only as a fallback where neither a code nor the state is
  available.
