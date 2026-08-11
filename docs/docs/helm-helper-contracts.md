# Magda Helm Helper Contracts

Magda publishes a small number of **versioned Helm helper templates** that
external charts — authentication plugins in particular, but also any chart that
connects to a Magda database — are expected to call. This document explains what
they are, why they are structured the way they are, and the rules for changing
them.

Read this if you maintain an authentication plugin or another chart installed
alongside Magda, or if you are adding a new helper contract to Magda itself.

## Why versioned contracts exist at all

Helm merges the templates of every chart in a release into **one flat, global
namespace**. When two charts define a template with the same name, the last
definition wins, and "last" is determined by chart name ordering.

This matters because `magda-common` — Magda's library chart — is **vendored**.
Roughly a dozen third-party charts (connectors, minions, semantic indexers,
authentication plugins) ship their own copy of it, frozen at whatever version
they were built against. Many of those chart names sort _after_ `magda` (for
example `magda-auth-oidc` > `magda`), so a stale vendored copy silently
overrides Magda's own.

This is not hypothetical. An earlier iteration of the PostgreSQL TLS work
defined the `PGSSLMODE` environment variable inside a `magda-common` template.
A stale vendored copy shadowed it, and Magda's Node services rendered **without**
`PGSSLMODE` and connected to PostgreSQL in **plaintext** — while every test that
only exercised `magda-core` still passed.

The contract system exists to make that class of failure impossible, or at least
loud.

## The two-layer design

Each contract is split across two charts, deliberately:

| Layer          | Lives in       | Vendored? | Contains                             |
| -------------- | -------------- | --------- | ------------------------------------ |
| Implementation | `magda-core`   | No        | All the logic                        |
| Versioned shim | `magda-common` | Yes       | A name, a version, and one `include` |

For the PostgreSQL `sslmode` contract that is:

- **`magda.db-client-sslmode-env`** — in `magda-core/templates/_helpers.tpl`.
  Resolves the mode and emits the env var. This is the real implementation.
- **`magda.db-client-sslmode-env-v1`** — in
  `magda-common/templates/_db-secrets.tpl`. Performs the compatibility handshake,
  then delegates to the above. It contains **no logic of its own**.

### Why keep both? Why not collapse them?

Because each chart can only satisfy one of the two requirements, and the
contract needs both:

- **`magda-core` is the only unshadowable home.** Nothing vendors it, so a
  definition there is guaranteed to be the one that runs. That is where logic
  must live.
- **`magda-common` is the only place external charts can reach.** A plugin
  chart declares `magda-common` as a dependency; it has no way to depend on
  `magda-core`. That is where the entry point must live.

Collapsing in either direction re-opens the plaintext bug:

- Moving the logic _down_ into `magda-common` makes it shadowable again.
- Pointing Magda's own charts at `-v1` routes Magda's own DB configuration
  through a vendorable template — same exposure.

Hence the rule: **Magda's own charts call `magda.db-client-sslmode-env`
directly and never go through `-v1`.** External charts call `-v1` and never
call the magda-core helper directly (they cannot reliably reach it by name
across versions).

The duplication is nominal — one `include` — and it is what makes the
frozen-contract guarantee below actually hold. Because every `-v1` copy in the
wild is a byte-identical, logic-free shim, it does not matter which vendored
copy wins the shadowing race. They all delegate to the same place.

## The compatibility handshake

### Inverted detection

Magda **cannot enumerate the charts installed alongside it.** Plugins are
_siblings_ of the `magda` chart, and Helm gives a subchart no way to see its
parent's siblings.

So detection is inverted. Rather than Magda scanning for plugins, **the plugin
calls into Magda**, announcing which contract it was built against:

```gotemplate
{{- include "magda.compatibility-check" (dict "helper" "db-client-sslmode-env-v1" "chart" .Chart.Name) -}}
```

`magda.compatibility-check` lives in `magda-core` and holds the single source of
truth:

```gotemplate
{{- $supported := list "db-client-sslmode-env-v1" -}}
```

If the announced contract is not in that list, rendering fails with a message
naming both the offending chart and the contract.

The important property: because the _check_ is unshadowable but the _shim_ is
not, the **installed Magda version always adjudicates**, no matter whose stale
vendored shim happens to execute.

### Failure matrix

Suppose a future Magda v8 drops v1 by changing `$supported` to
`list "db-client-sslmode-env-v2"`:

| Plugin ships  | Magda version         | Result                                                                                            |
| ------------- | --------------------- | ------------------------------------------------------------------------------------------------- |
| `-v1` shim    | v8 (supports v2 only) | Render fails, naming the chart and contract. Actionable.                                          |
| `-v2` shim    | v7 (supports v1 only) | Same check, opposite direction — also caught.                                                     |
| `-v2` shim    | v6 (pre-handshake)    | Fails with `no template "magda.compatibility-check" associated`. Cryptic, but still fails closed. |
| matching pair | —                     | Check passes, delegates, emits the env var.                                                       |

Every mismatch fails at **render time**, before anything is installed. None of
them can degrade silently the way the original plaintext bug did.

## Rules for changing a contract

**A released contract is frozen.** Once `-v1` ships, its behaviour must never
change. Many charts vendor their own copy and any of them may be the one that
runs, so you do not control which implementation of `-v1` executes — only that
they all agree.

To change behaviour:

1. Add a **new** shim, `magda.db-client-sslmode-env-v2`, alongside the old one.
2. Add `"db-client-sslmode-env-v2"` to `$supported`.
3. Leave `-v1` completely untouched.
4. When support for v1 genuinely ends, **remove it from `$supported`**. That is
   what converts a silently-misbehaving old plugin into a loud, actionable
   failure.

Note that step 4 is the whole point of the list. Leaving a contract in
`$supported` forever means never getting the error.

## For plugin authors

### Calling the contract

From your deployment template:

```gotemplate
{{- include "magda.db-client-sslmode-env-v1" . | indent 8 }}
```

### Requires Magda v7+

Both templates the shim delegates to live in `magda-core` v7 or later. Calling
it without that present — **including a standalone `helm template` or
`helm lint` of your chart in CI** — fails with:

```
no template "magda.compatibility-check" associated with template "gotpl"
```

This is expected. Your chart is not broken; `magda-core` simply is not in the
release.

### The opt-out flag

Declare the default in your chart's `values.yaml`:

```yaml
global:
  magdaCompatibilityCheck: true
```

It is read as a **global** so an operator can disable it once for every plugin
rather than chart by chart.

For CI runs that render your chart standalone, disable it:

```bash
helm template ./my-plugin --set global.magdaCompatibilityCheck=false
```

> **Use unquoted `false`.** Helm treats the _string_ `"false"` as truthy, so
> `magdaCompatibilityCheck: "false"` silently leaves the check enabled. The
> failure mode is safe (the check runs when it shouldn't, rather than the
> reverse) but confusing.

The flag defaults to **enabled when absent**. This is deliberate — forgetting to
declare it fails closed and loudly, rather than silently skipping the check.
For the same reason the implementation uses `hasKey` rather than `default`,
since Helm's `default` treats an explicit `false` as empty and would flip it
back to `true`.

## Available contracts

| Contract                         | Since        | Emits                                                   | Replaces |
| -------------------------------- | ------------ | ------------------------------------------------------- | -------- |
| `magda.db-client-sslmode-env-v1` | Magda v7.0.0 | `PGSSLMODE` env var for the restricted `client` DB role | —        |

For what `PGSSLMODE` resolves to and how to configure it, see
`global.postgresql.client.sslmode` in the
[Magda Helm Chart Reference](./helm-charts-docs-index.md) and the
[AWS deployment guide](./deploy-to-aws.md).

## The PostgreSQL client CA delivery helpers

`sslmode: verify-ca` / `verify-full` require every DB-connecting workload to
be able to read the PostgreSQL server's CA certificate. `magda-core`'s
`templates/_helpers.tpl` publishes a small set of helpers, alongside the
`sslmode` ones above, that every workload template uses to do this
consistently. Unlike the `-v1` contract above, these are not (yet) exposed to
external charts through a versioned `magda-common` shim — no plugin needs them
today, so they are internal to `magda-core` and used only by Magda's own
workload templates. Treat their names as an implementation detail rather than
a stable external API until a versioned shim exists.

**The render-time contract.** `magda.postgres-client-sslmode` — the helper
that resolves `global.postgresql.client.sslmode` — fails the render if the
resolved mode has the `verify-` prefix and
`global.postgresql.client.sslRootCertSecret.name` is empty. There is
deliberately **no** trust-store fallback, even when the server's CA is a
publicly-trusted root (for example Azure Database for PostgreSQL's DigiCert
Global Root G2): Magda's DB migrator image ships libpq older than 16, which
has no `sslrootcert=system` support, so a fallback would only defer the
failure from `helm install` to a connect-time crash loop. The secret is
mandatory for `verify-*`, full stop.

**The five public helpers:**

| Helper                                 | Emits                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `magda.postgres-client-ca-enabled`     | The literal string `"true"` when `global.postgresql.client.sslRootCertSecret.name` is set, otherwise nothing. Used as an `if` condition (`eq (include "magda.postgres-client-ca-enabled" .) "true"`), never rendered directly into a manifest.                                                                                                            |
| `magda.postgres-client-ca-volume`      | A `secret` volume named `postgresql-ca`, remapping whichever key holds the CA (`sslRootCertSecret.key`, default `ca.crt`) to the fixed file name `root.crt` via the volume's `items:` list. **Does not self-guard** — it renders unconditionally, so every caller must wrap it in `{{- if eq (include "magda.postgres-client-ca-enabled" .) "true" }}`.   |
| `magda.postgres-client-ca-volumemount` | The matching `volumeMount` for the `postgresql-ca` volume, read-only, mounted at `/etc/magda/postgresql-ca`. Also does not self-guard; gate it the same way.                                                                                                                                                                                              |
| `magda.db-client-ca-env-node`          | `PGSSLROOTCERT` pointed at `/etc/magda/postgresql-ca/root.crt`, for Node services that read the standard libpq environment variables (`gateway`, `authorization-api`, `content-api`, `tenant-api`). Emits nothing when no CA secret is configured, leaving `PGSSLROOTCERT` unset so `getPgSslConfigFromEnv` falls back to Node's own bundled trust store. |
| `magda.db-client-ca-env-libpq`         | Same output as `-node`, for libpq-based consumers: `psql` inside the DB migrator Jobs and the `registry-db` auto-vacuum CronJob, and `wal-g`. Kept as a separate name from `-node` so the two client classes can diverge in the future without hunting for a second copy.                                                                                 |

**The one internal helper:**

`magda.db-client-ca-env-common` is the shared body both class helpers
delegate to — it is the only place that actually decides whether to emit
`PGSSLROOTCERT`. It is marked **INTERNAL — do not include from a workload
template**; always include the class-specific helper (`-node` or `-libpq`)
instead, so the class's constraint is documented at the call site rather than
requiring every reader to know which classes are safe.

**Never `system`, for either class.** No helper ever emits the literal value
`system` for `PGSSLROOTCERT`. For libpq this is because the migrator/auto-vacuum
images ship libpq older than 16, which rejects `sslrootcert=system` outright.
For Node it would be actively worse: `getPgSslConfigFromEnv` would call
`fs.readFileSync("system")`, which is not a path to anything, and the pod would
crash on boot. If a future image bump puts libpq ≥ 16 everywhere, only
`magda.db-client-ca-env-libpq` needs to change — the `-node` and `-common`
helpers are unaffected.

**The class split, restated.** Node services consume the CA through the
`PGSSLROOTCERT` environment variable. `registry-api` is the one exception:
it connects via Flyway/pgjdbc-derived JDBC URLs, and pgjdbc ignores `PG*`
environment variables entirely, so `registry-api`'s own helpers bake the CA
path into the JDBC URL as an `sslrootcert=` parameter instead of calling
`magda.db-client-ca-env-node`. The DB migrator Jobs need **both** forms at
once — `migrate.sh` drives plain `psql` (which honours `PGSSLROOTCERT`, via
`magda.db-client-ca-env-libpq`) and also runs Flyway over pgjdbc (which needs
the JDBC `sslrootcert=` parameter, appended the same way `registry-api` does
it).

**The fixed mount path.** Regardless of which key in the Secret holds the PEM
(`sslRootCertSecret.key`, default `ca.crt`), `magda.postgres-client-ca-volume`
always remaps it to `root.crt` inside the `postgresql-ca` volume, so every
consumer references the same constant path,
`/etc/magda/postgresql-ca/root.crt`. Callers never need to know or template
the configured key name.

## Maintainer checklist

When adding a contract:

- [ ] Implementation goes in `magda-core`, never `magda-common`.
- [ ] Shim goes in `magda-common`, contains no logic beyond the check and one
      `include`.
- [ ] Add the name to `$supported` in `magda.compatibility-check`.
- [ ] Add a row to the _Available contracts_ table above.
- [ ] Add coverage to `deploy/helm/magda-core/tests/compatibility-check.sh` —
      Magda's own charts never exercise the handshake, so without a fixture test
      it would first run in a user's cluster.

Never add a no-op fallback definition of `magda.compatibility-check` anywhere.
A fallback in a vendorable chart would win over the real one and the check would
silently stop running.
