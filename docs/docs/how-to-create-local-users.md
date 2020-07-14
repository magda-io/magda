# How to create API key

Magada now support creating local authenticated users (instead of SSO). You can use the `set-user-password` script to create users / set password for users. Please note: users will need to use their email address as username to login.

Before start to use the `set-user-password script, you need to:

-   Clone Magda repo
-   Run `yarn install` to install all dependencies
-   Port forward the Magda database to local:
    -   `kubectl port-forward combined-db-0 5432:5432`
    -   If you didn't install magda to the default namespace, you can use: `kubectl port-forward -n [namespace] combined-db-0 5432:5432`

After the installation is done, run `yset-user-password` will list help information as below:

```
Usage: set-user-password [options]

A tool for setting magda users' password. Version: 0.0.57-0
By Default, a random password will be auto generate if -p or --password option does not present.
The database connection to auth DB is required, the following environment variables will be used to create a connection:
  POSTGRES_HOST: database host; If not available in env var, 'localhost' will be used.
  POSTGRES_DB: database name; If not available in env var, 'auth' will be used.
  POSTGRES_USER: database username; If not available in env var, 'postgres' will be used.
  POSTGRES_PASSWORD: database password; If not available in env var, '' will be used.

Options:
  -V, --version                          output the version number
  -u, --user [User ID or email]          Specify the user id or email of the user whose password will be reset. If -c switch not present, this switch must be used.
  -c, --create [user email]              Create the user record before set the password rather than set password for an existing user. If -u switch not present, this switch must be used.
  -p, --password [password string]       Optional. Specify the password that reset the user account to.
  -n, --displayName [user display name]  Optional, valid when -c is specified. If not present, default display will be same as the email address. Use double quote if the name contains space.
  -a, --isAdmin                          Optional, valid when -c is specified. If present, the user will be created as admin user.
  -h, --help                             output usage information
✨  Done in 0.58s.
```

#### Example Usage:

To create a user (with auto generated password):

```bash
yarn set-user-password -c xxx@email.com -n "Joe Bloggs"
```

To set the password for a user:

```bash
yarn set-user-password -u xxx@email.com -p "my new password"
```
