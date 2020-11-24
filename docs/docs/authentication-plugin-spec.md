# Authentication Plugin Specification

Since v0.0.58, Magda allows you to build external authentication plugins to add support to different authorization servers / identity providers. It also allow you to customise the process of creating & mapping the user's profile to a local user (e.g. assign specific roles depends on users's profile).

An authentication plugin, technically, is a set of HTTP services that are integrated with [Magda gateway](https://github.com/magda-io/magda/blob/master/deploy/helm/internal-charts/gateway/README.md) and the frontend UI. Athough it is not compulsory, we recommend you to use [express.js](https://expressjs.com/) & [passport.js](http://www.passportjs.org/) to build the HTTP services for your authentication plugin. You will find all our [existing authentication plugins](https://github.com/magda-io?q=magda-auth-) are build with [express.js](https://expressjs.com/) & [passport.js](http://www.passportjs.org/).

## Build Your Own Authentication plugin

For ease of deployment, Magda requires an authentication plugin to be build as a docker image, packed as a [Helm Chart](https://helm.sh/docs/topics/charts/) and to be used by your Magda deployment as Helm chart dependencies.

you don't have to start from scratch to create your own authentication plugin. Instead, you can use this [Github template repo](https://github.com/magda-io/magda-auth-template) to create a blank project. Github template repo can help to generate a new repository with the same directory structure and files as an existing template repository. You can find out more details from [here](https://docs.github.com/en/free-pro-team@latest/github/creating-cloning-and-archiving-repositories/creating-a-repository-from-a-template).

After a new repo is generated from the template, you can start to implement your own authentication logic and required HTTP endpoints in `src/createAuthPluginRouter.ts`. If you use [passport.js](http://www.passportjs.org/), you can find passport.js `strategies` that support different IDPs (identity providers) or authentication servers from [passportjs website](http://www.passportjs.org) `Strategies` section.

The template also comes with CI scripts that can automatically pushing docker image to docker hub and publish helm chart to s3. For more details, please check [magda-auth-template](https://github.com/magda-io/magda-auth-template) repo `README.md` file.

Magda also provides NPM packages [@magda/authentication-plugin-sdk](https://www.npmjs.com/package/@magda/authentication-plugin-sdk) and [@magda/auth-api-client](https://www.npmjs.com/package/@magda/auth-api-client) that can assit you with implementing your authentication logic.

## Common Parameters Available Through MAGDA

When deploy with MAGDA, here are a list of common paramaters are made available to the authentication plugin via various ways.

### Auth Plugin Redirect Url

This parameter is available through Helm chart value [global.authPluginRedirectUrl](https://github.com/magda-io/magda/blob/master/deploy/helm/magda-core/README.md#user-content-values).

Its default value can be found from [magda-core helm chart document](https://github.com/magda-io/magda/blob/master/deploy/helm/magda-core/README.md#user-content-values).

Once the authentication plugin complete the authentication process, the plugin is required to redirect user agent to the url specified by this parameter.

When redirect the user agent, the plugin can choose to passing the following query parameters:

-   `result`: Possible value: "success" or "failure".
    -   When the parameter not present, its value should be assumed as "success"
-   `errorMessage`: error message that should be displayed to the user. Only available when `result`="success".

[authentication-plugin-sdk](https://www.npmjs.com/package/@magda/authentication-plugin-sdk) provides function `redirectOnSuccess`, `redirectOnError` & `getAbsoluteUrl` to generate the redirection.

### Cookie Options

Cookie options are required by [authentication-plugin-sdk](https://www.npmjs.com/package/@magda/authentication-plugin-sdk) to create session that meet Gateway's requirements.

This parameter is made available through [configMaps](https://kubernetes.io/docs/concepts/configuration/configmap/) `gateway-config` key `cookie.json`.

## Required HTTP endpoints

Your auth plugin can choose to serve any endpioints as you want. All HTTP endpoint will be exposed by Magda Gateway at path `/auth/login/plugin/[your auth plugin key]/*`.

Below are a list of compulsory HTTP endpoints that an auth plugin is required to implement in order to integrate with Magda Gateway & UI.

### GET `/config` Endpoint

This endpoint is required to response the auth plugin's config information in JSON format. Possible fields are:

-   `key`: (string) the unique key of the auth plugin. Allowed characters: [a-zA-Z0-9\-]
-   `name`: (string) the display name of the auth plugin.
-   `iconUrl`: (string) the display icon of the auth plugin.
-   `authenticationMethod`: (string) The authentication method of the plugin. Support values are:
    -   `IDP-URI-REDIRECTION`: the plugin will rediredct user agent to idp (identity provider) for authentication. e.g. Google & fackebook oauth etc.
    -   `PASSWORD`: the plugin expect frontend do a form post that contains username & password to the plugin for authentication.
        -   The frontend will always post username & password to auth plugin root url.
    -   `QR-CODE`: the plugin offers a url that is used by the frontend to request auth challenge data. The data will be encoded into a QR-code image and expect the user scan the QR code with a mobile app to complete the authentication request.
        -   Once the QR-code image is generated, the frontend is expected to start polling a pre-defined plugin url to check whether the authentication is complete or not.
-   `loginFormExtraInfoHeading`: (string) Optional; Only applicable when authenticationMethod = "PASSWORD".
    -   If present, will displayed the heading underneath the login form to provide extra info to users. e.g. how to reset password
-   `loginFormExtraInfoContent`: (string) Optional; Only applicable when authenticationMethod = "PASSWORD".
    -   If present, will displayed the content underneath the login form to provide extra info to users. e.g. how to reset password
    -   Can support content in markdown format
-   `loginFormUsernameFieldLabel`: (string) Optional; Only applicable when authenticationMethod = "PASSWORD". Default value: `Username`
-   `loginFormPasswordFieldLabel`: (string) Optional; Only applicable when authenticationMethod = "PASSWORD". Default value: `Password`
-   `qrCodeImgDataRequestUrl`: (string) Only applicable & compulsory when authenticationMethod = "QR-CODE".
    -   the url that is used by frontend client to request auth challenge data from the authentication plugin. The received auth challenge data will be encoded into a QR Code Image and expect the user process the auth challenge data by scaning the QR code using a mobile app.
    -   the url should return a JSON object with two fields:
        -   `token`: an auth request token that can used by frontend to poll the authentication result.
        -   `data`: the auth challenge data that expected to be processed by user's mobile app via QR code scaning.
-   `qrCodeAuthResultPollUrl`: (string) Only applicable & compulsory when authenticationMethod = "QR-CODE".
    -   The url that is used by frontend to poll the authentication processing result.
    -   the frontend will send back the auth request token (via query parameter `token`) when poll this url
    -   The url should response a JSON object the following fields:
        -   `result`: a text field represent the processing status.
            -   `pending`: default status. the authentication request is still processing.
            -   `success`: the authentication request is processed completed.
            -   `failure`: the authentication request is failed.
        -   `errorMessage`: optional; details error message for users.
-   `qrCodeExtraInfoHeading`: (string) Optional; Only applicable when authenticationMethod = "QR-CODE".
    -   If present, will displayed the heading underneath the QR Code image to provide extra instruction to users. e.g. how to download moile app to scan the QR Code
-   `qrCodeExtraInfoContent`: (string) Optional; Only applicable when authenticationMethod = "PASSWORD".
    -   If present, will displayed the content underneath the login form to provide extra info to users. e.g. how to download moile app to scan the QR Code
    -   Can support content in markdown format

> Please note: any url fields required as part of the auth config don't have to be an absolute url. If you supply a relative URL (e.g. `/config`), other components of Magda know to how to convert it to an external accessible URL (e.g. `/auth/login/plugin/[your auth plugin key]/config`).

### GET `/` Endpoint

The GET `/` Endpoint is supported by all authentication plugins types. When accessed by a user's web browser:

-   if the user has been authenticated already, the endpoint should issue a `302` redirection that redirect the user's web browser to a pre-configured url that is specified by:
    -   either query parameter `redirect`
    -   Or Helm Chart value `global.authPluginRedirectUrl`) when if query parameter `redirect` does not exist
-   if the user has not been authenticated, the endpoint should:
    -   For `IDP-URI-REDIRECTION` type plugin, the endpoint should issue a `302` redirection to start the authenticaiton process accordingly.
    -   For `PASSWORD` or `QR-CODE` type plugin, the endpoint should redirect user agent to the redirect url with `result` set to "failure" and `errorMessage` set to "unauthorised".

> If you use [Passport.js](http://www.passportjs.org/) to build your auth plugin, this will be handled via [passport.authenticate() method](http://www.passportjs.org/docs/authenticate/).

### POST `/` Endpoint

The POST `/` Endpoint is only supported by `PASSWORD` type plugin. The plugin expects two fields `username` & `password` are posted to this endpoint in `application/x-www-form-urlencoded` encoding (HTML form post).

> If you use [Passport.js](http://www.passportjs.org/) to build your auth plugin, this will be handled via [passport.authenticate() method](http://www.passportjs.org/docs/authenticate/).

### Auth Plugin Icon Endpoint

An auth plugin is required to serve an 36x36 image file to be used by Magda UI to be displayed on the authentication options list. This url is required to be set as the value of `iconUrl` field of the auth plugin config (see `GET`/config`Endpoint` above).
