# Authentication Plugin Specification

You can pack customised authentication logic as a microservice and "plug" into Magda as [Helm Chart](https://helm.sh/docs/topics/charts/) dependencies. This document covers the technical requirements of authentication plugin.

## Required HTTP endpoints

### GET `/config` Endpoint

This endpoint is required to response the auth plugin's config information in JSON format. Possible fields are:

-   `key`: (string) the unique key of the auth plugin. Allowed characters: [a-zA-Z0-9\-]
-   `name`: (string) the display name of the auth plugin
-   `iconUrl`: (string) the display icon of the auth plugin
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

### GET `/` Endpoint

The GET `/` Endpoint is supported by all authentication plugins types. When accessed by a user's web browser:

-   if the user has been authenticated already, the endpoint should issue a `302` redirection that redirect the user's web browser to a pre-configured url (Specified by Helm Chart value `global.authPluginRedirectUrl`).
-   if the user has not been authenticated, the endpoint should:
    -   For `IDP-URI-REDIRECTION` type plugin, the endpoint should issue a `302` redirection to start the authenticaiton process accordingly.
    -   For `PASSWORD` or `QR-CODE` type plugin, the endpoint should issue a `401` Error.

### POST `/` Endpoint

The POST `/` Endpoint is only supported by `PASSWORD` type plugin. The plugin expects two fields `username` & `password` are posted to this endpoint in `application/x-www-form-urlencoded` encoding (HTML form post).
