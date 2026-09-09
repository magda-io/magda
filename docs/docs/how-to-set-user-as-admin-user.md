# How to set a user as an admin user

You can use Magda [acs-cmd](https://www.npmjs.com/package/@magda/acs-cmd) command line utility to set your account as an Admin. Alternatively, if you already have a user with admin access, you can login and go to the "Admin / User Accounts" section to set / unset a user as an admin.

## Installation

Please refer to [acs-cmd utility NPM page](https://www.npmjs.com/package/@magda/acs-cmd) for installation instructions.

## Usage

Before start to use the [acs-cmd](https://www.npmjs.com/package/@magda/acs-cmd) utility, you need to:

- Port forward the Magda database to local:
  - `kubectl port-forward combined-db-postgresql-pg17-0 5432:5432`
    - If you didn't install magda to the default namespace, you can use: `kubectl port-forward -n [namespace] combined-db-postgresql-pg17-0 5432:5432`

> Prior to Magda v1.0.0, you should port-forward pod combined-db-0

`acs-cmd` connects to the authorization database using the standard `libpq` `PG*` environment variables.
Point it at the forwarded port using the database superuser (`postgres`) credentials — the `magda-core`
chart stores that password in the `db-main-account-secret` secret (key `postgresql-password`):

```bash
export PGHOST=127.0.0.1 PGPORT=5432 PGUSER=postgres PGDATABASE=auth
export PGPASSWORD=$(kubectl get secret db-main-account-secret -o jsonpath='{.data.postgresql-password}' | base64 --decode)
# add `-n [namespace]` to the kubectl command above if Magda is not installed in the default namespace
```

From Magda v7, the combined database enforces **TLS with a self-signed certificate**. Over a
`kubectl port-forward` that certificate cannot be verified (its subject will not match `127.0.0.1`), so the
connection fails with `Error: unable to verify the first certificate`. For this local, one-off connection,
enable TLS without certificate verification:

```bash
export PGSSLMODE=require
export NODE_TLS_REJECT_UNAUTHORIZED=0
```

To set a user as admin users:

```bash
acs-cmd admin set [userId]
```

Or remove admin status / role from the user:

```bash
acs-cmd admin unset [userId]
```

To find out the user id of your account, you can:

```bash
acs-cmd list users
```
