# How to create API key

Magda API keys provide users an alternative option to authenticate their requests while accessing API endpoints.

## How to use API key

There are 2 ways to supplied API key:

- Option 1: Supply API key id & key via request headers `X-Magda-API-Key-Id` & `X-Magda-API-Key`
- Option 2: Supply API key as bearer token via `Authorization` request header.
  - the `Authorization` request header value should be in format of `Bearer [API Key ID]:[API key]`
  - As this option involves `Authorization` request header, you can't choose this option when you turn on the `HTTP basic authentication` feature of the gateway.

## How to generate API key

### From Web UI "Settings" Panel

After a user logs into the system, he can generate API keys from the "My Account" section.

The UI offers further information of API key usage as well

### Using `create-api-key` script

To access an API with an API key, the request is required to carry the headers, which can be generated using `create-api-key` script.

Before start to use the `create-api-key` script, you need to:

- Clone Magda repo
- Run `yarn install` to install all dependencies
- Port forward the Magda database to local:
  - `kubectl port-forward combined-db-postgresql-0 5432:5432`
  - If you didn't install magda to the default namespace, you can use: `kubectl port-forward -n [namespace] combined-db-postgresql-0 5432:5432`

> Prior to Magda v1.0.0, you should port-forward pod combined-db-0

After the installation is done, run `yarn create-api-key` will list help information as below:

```
Usage: create-api-key [options]

A tool for creating API keys for a user. Version: 0.0.57-0
The database connection to auth DB is required, the following environment variables will be used to create a connection:
  POSTGRES_HOST: database host; If not available in env var, 'localhost' will be used.
  POSTGRES_DB: database name; If not available in env var, 'auth' will be used.
  POSTGRES_USER: database username; If not available in env var, 'postgres' will be used.
  POSTGRES_PASSWORD: database password; If not available in env var, '' will be used.

Options:
  -V, --version           output the version number
  -u, --userId [User ID]  Specify the user id whose api key will be created.
  -c, --create            set this switch to create a new api key
  -l, --list              When -u switch presents, this switch will list all api keys (id & create time) of the user. Otherwise, all users will be listed.
  -h, --help              output usage information
✨  Done in 0.69s.
```

#### Example Usage:

To list all users, you can:

```bash
yarn create-api-key -l
```

To list all API keys for a user:

```bash
yarn create-api-key -u [user id] -l
```

To create API key for a user:

```bash
yarn create-api-key -u [user id] -c
```
