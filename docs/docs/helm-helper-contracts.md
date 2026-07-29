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
