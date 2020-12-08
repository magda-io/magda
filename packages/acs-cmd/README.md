## MAGDA acs-cmd Utility

A set of tools for managing Magda user accounts. You might also want to have a look at [org-tree](https://www.npmjs.com/package/@magda/org-tree) utility.

### Install

```
$ npm install --global @magda/acs-cmd
```

### Upgrade

To update the existing installation to the latest version:

```
$ npm install --global @magda/acs-cmd@latest
```

### Usage

Run without any options will show the help information:

```
$ acs-cmd

Usage: acs-cmd [options] [command]

A tool for managing magda access control data. Version: x.x.x

If a database connection is required, the following environment variables will be used to create a connection:
  POSTGRES_HOST: database host; If not available in env var, 'localhost' will be used.
  POSTGRES_DB: database name; If not available in env var, 'auth' will be used.
  POSTGRES_USER: database username; If not available in env var, 'postgres' will be used.
  POSTGRES_PASSWORD: database password; If not available in env var, '' will be used.

Options:
  -V, --version             output the version number
  -h, --help                output usage information

Commands:
  admin                     Make an user an Admin user or remove admin role / status from a user
  list                      List records (permissions, operations etc.)
  assign                    Assign a permission to a role or a role to a user
  remove                    Remove a permission from a role or a role from a user
  create                    Create permissions, operations etc
  jwt <userId> [jwtSecret]  calculate JWT token (only for testing purpose)
  help [cmd]                display help for [cmd]
```

> You will need to port forward the Magda database to localhost to make sure the utility can connect to your Magda database.

-   To do so, You can run `kubectl port-forward combined-db-0 5432`.
    -   If you didn't install magda to the default namespace, you can use: `kubectl port-forward -n [namespace] combined-db-0 5432`

#### Example

List all user accounts

```
$ acs-cmd list users

╔══════════════════════════════════════╤═════════════════╤══════════════════════╤═══════════════════════════════════════╗
║ ID                                   │ Name            │ Org Unit             │ Roles                                 ║
╟──────────────────────────────────────┼─────────────────┼──────────────────────┼───────────────────────────────────────╢
║ 00000000-0000-4000-8000-000000000000 │ admin           │                      │ 00000000-0000-0002-0000-000000000000: ║
║                                      │                 │                      │ Authenticated Users                   ║
║                                      │                 │                      │                                       ║
║                                      │                 │                      │ 00000000-0000-0003-0000-000000000000: ║
║                                      │                 │                      │ Admin Users                           ║
╟──────────────────────────────────────┼─────────────────┼──────────────────────┼───────────────────────────────────────╢
║ 02a301df-4e14-46aa-9a00-543033066a72 │ test user       │                      │ 00000000-0000-0003-0000-000000000000: ║
║                                      │                 │                      │ Admin Users                           ║
╚══════════════════════════════════════╧═════════════════╧══════════════════════╧═══════════════════════════════════════╝
```
