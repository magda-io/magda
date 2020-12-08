## MAGDA create-secrets Tool

A CLI tool that helps to create kuberneter secrets required by [Magda](https://magda.io/).

### Install

```
$ npm install --global @magda/create-secrets
```

### Upgrade

To update the existing installation to the latest version:

```
$ npm install --global @magda/create-secrets@latest
```

### Usage

-   Run without options will show the questionnaire to guide you through the process:

```
$ create-secrets

magda-create-secrets tool version: x.xx.x
Found previous saved config (September 2nd 2020, 1:58:17 pm).
? Do you want to connect to kubernetes cluster to create secrets without going through any questions?
❯ NO (Going through all questions)
  YES (Create Secrets in Cluster using existing config now)
```

-   Run with --help will show all options:

```
$ create-secrets --help

Usage: create-secrets [options]

A tool for magda k8s secrets setup. Version: x.x.xx

Options:
  -V, --version                   output the version number
  -E, --execute [configFilePath]  Create k8s secrets in cluster using `${appName}` config file/data without asking any user input.
     If you want to supply config data via STDIN, you can set `configFilePath` parameter to `-`.
     e.g. `echo $CONFIG_CONTENT | magda-create-secrets -E -` or `cat config.json | magda-create-secrets --execute=-`
     If configFilePath is not specify, program will attempt to load config file from:
     either `$XDG_CONFIG_HOME/configstore/magda-create-secrets.json`
     or `~/.config/configstore/magda-create-secrets.json`
  -P, --print                     Print previously saved local config data to stdout
  -D, --delete                    Delete previously saved local config data
  -h, --help                      output usage information
  Available Setting ENV Variables:

    DEPLOY_TO_GOOGLE_CLOUD : Are you creating k8s secrets for google cloud or local testing cluster?
    LOCAL_CLUSTER_TYPE : Which local k8s cluster environment you are going to connect to?
    USE_CLOUDSQL_INSTANCE_CREDENTIALS : Do you use google cloud SQL service as your database?
    CLOUDSQL_DB_CREDENTIALS : Please provide default google cloud SQL service DB password:
    RESELECT_CLOUDSQL_INSTANCE_CREDENTIALS : Has located saved Google SQL cloud credentials JSON file. Do you want to re-select?
    CLOUDSQL_INSTANCE_CREDENTIALS : Please provide the path to the credentials JSON file for your Google SQL cloud service access:
    USE_STORAGE_ACCOUNT_CREDENTIALS : Do you use google storage service?
    RESELECT_STORAGE_ACCOUNT_CREDENTIALS : Has located saved Google storage private key JSON file. Do you want to re-select?
    STORAGE_ACCOUNT_CREDENTIALS : Please provide the path to the private key JSON file for your Google storage service access:
    USE_SMTP_SECRET : Do you need to access SMTP service for sending data request email?
    SMTP_SECRET_USERNAME : Please provide SMTP service username:
    SMTP_SECRET_PASSWORD : Please provide SMTP service password:
    USE_REGCRED : Do you use Gitlab as your CI system and need the access to Gitlab docker registry?
    USE_REGCRED_PASSWORD_FROM_ENV : Do you want to get gitlab docker registry password from environment variable ($CI_JOB_TOKEN) or input manually now?
    REGCRED_EMAIL : Please provide the email address that you want to use for Gitlab docker registry:
    REGCRED_PASSWORD : Please provide password for Gitlab docker registry:
    USE_OAUTH_SECRETS_GOOGLE : Do you want to create google-client-secret for oAuth SSO?
    OAUTH_SECRETS_GOOGLE : Please provide google api access key for oAuth SSO:
    USE_OAUTH_SECRETS_FACEBOOK : Do you want to create facebook-client-secret for oAuth SSO?
    OAUTH_SECRETS_FACEBOOK : Please provide facebook api access key for oAuth SSO:
    USE_OAUTH_SECRETS_ARCGIS : Do you want to create arcgis-client-secret for oAuth SSO?
    OAUTH_SECRETS_ARCGIS : Please provide arcgis api access key for oAuth SSO:
    USE_OAUTH_SECRETS_AAF : Do you want to create aaf-client-secret for AAF Rapid Connect SSO?
    OAUTH_SECRETS_AAF : Please provide AAF secret for AAF Rapid Connect SSO:
    USE_WEB_ACCESS_SECRET : Do you want to setup HTTP Basic authentication?
    WEB_ACCESS_USERNAME : Please provide the username for HTTP Basic authentication setup:
    MANUAL_WEB_ACCESS_PASSWORD : Do you want to manually input the password for HTTP Basic authentication setup?
    WEB_ACCESS_PASSWORD : Please provide the password for HTTP Basic authentication setup:
    MANUAL_DB_PASSWORDS : Do you want to manually input the password used for databases?
    DB_PASSWORDS : Please provide the password used for databases:
    ACCESSKEY : Please enter an access key for your MinIO server:
    SECRETKEY : Please enter a secret key for your MinIO server::
    GET_NAMESPACE_FROM_ENV : Specify a namespace or leave blank and override by env variable later?
    CLUSTER_NAMESPACE : What's the namespace you want to create secrets into (input `default` if you want to use the `default` namespace)?
    ALLOW_ENV_OVERRIDE_SETTINGS : Do you want to allow environment variables (see --help for full list) to override current settings at runtime?
```
