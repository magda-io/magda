# How to set a user as an admin user

You can use Magda [acs-cmd](https://www.npmjs.com/package/@magda/acs-cmd) command line utility to set your account as an Admin. Alternatively, if you already have a user with admin access, you can login and go to the "Admin / User Accounts" section to set / unset a user as an admin.

## Installation

Please refer to [acs-cmd utility NPM page](https://www.npmjs.com/package/@magda/acs-cmd) for installation instructions.

## Usage

Before start to use the [acs-cmd](https://www.npmjs.com/package/@magda/acs-cmd) utility, you need to:

-   Port forward the Magda database to local:
    -   `kubectl port-forward combined-db-0 5432:5432`
        -   If you didn't install magda to the default namespace, you can use: `kubectl port-forward -n [namespace] combined-db-0 5432:5432`

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
