import React, { useState, FunctionComponent } from "react";
import fbLogo from "assets/login/fb-logo.svg";
import googleLogo from "assets/login/google-logo.svg";
import arcgisLogo from "assets/login/esri-logo.svg";
import aafLogo from "assets/login/aaf-logo.png";
import ckanLogo from "assets/login/ckan.png";
import magdaLogo from "assets/login/magda.png";
import genericLogo from "assets/login/generic-logo.svg";
import "./AccountLoginPage.scss";
import { getAuthProviders, getAuthPlugins } from "api-clients/AuthApis";
import { config } from "config";
import { useAsync } from "react-async-hook";
import CommonLink from "Components/Common/CommonLink";
import urijs from "urijs";
import { AuthPluginConfig } from "@magda/gateway/src/createAuthPluginRouter";
import { markdownToHtml } from "Components/Common/MarkdownViewer";
const { baseUrl, uiBaseUrl } = config;

function getDefaultLoginFormProvider(
    authConfigItems: AuthConfig[]
): AuthConfig | null {
    if (!authConfigItems || !authConfigItems.length) {
        return null;
    }

    let selectConfigItem = authConfigItems.find(
        (config) => !config.isAuthPlugin && config.config === "internal"
    );
    if (selectConfigItem) {
        return selectConfigItem;
    }

    selectConfigItem = authConfigItems.find(
        (config) => !config.isAuthPlugin && config.config === "ckan"
    );
    if (selectConfigItem) {
        return selectConfigItem;
    }

    selectConfigItem = authConfigItems.find(
        (config) =>
            config.isAuthPlugin &&
            config.config.authenticationMethod === "PASSWORD"
    );
    if (selectConfigItem) {
        return selectConfigItem;
    }

    return null;
}

export type AuthConfig =
    | {
          isAuthPlugin: false;
          config: string;
      }
    | {
          isAuthPlugin: true;
          config: AuthPluginConfig;
      };

const makeLoginUrl = (authConfig: AuthConfig) => {
    if (!authConfig.isAuthPlugin) {
        const oauthRedirect = urijs()
            .search("")
            .fragment("")
            .segment([uiBaseUrl, "sign-in-redirect"])
            .search({
                redirectTo: "/account"
            })
            .toString();
        return `${baseUrl}auth/login/${
            authConfig.config
        }?redirect=${encodeURIComponent(oauthRedirect)}`;
    } else {
        // auth plugins share the same gateway helm chart config [authPluginRedirectUrl](https://github.com/magda-io/magda/tree/master/deploy/helm/internal-charts/gateway)
        // thus, we don't need to supply redirection url here
        return `${baseUrl}auth/login/plugin/${authConfig.config.key}`;
    }
};

function ucwords(str: string) {
    str = str.toLowerCase();
    return str.replace(/(^([a-zA-Z\p{M}]))|([ -][a-zA-Z\p{M}])/g, function (s) {
        return s.toUpperCase();
    });
}

type LoginFormPropsType = {
    authConfig: AuthConfig;
};

const LoginFormArea: FunctionComponent<LoginFormPropsType> = (props) => {
    const { authConfig } = props;

    let providerName: string = "";
    let usernameLabel: string = "User name";
    let passwordLabel: string = "Password";
    let loginFormExtraInfoHeading = "";
    let loginFormExtraInfoContent = "";

    if (!authConfig.isAuthPlugin && authConfig.config === "internal") {
        providerName = "Magda";
        usernameLabel = "Email Address";
        loginFormExtraInfoHeading = "Forgot your password?";
        loginFormExtraInfoContent = `Forgot your password? ${
            config.defaultContactEmail
                ? `Email [${config.defaultContactEmail}](${config.defaultContactEmail})`
                : "Contact your administrator."
        }`;
    } else if (!authConfig.isAuthPlugin && authConfig.config === "ckan") {
        providerName = "Data.gov.au";
        loginFormExtraInfoHeading = "Register";
        loginFormExtraInfoContent = `To register a new data.gov.au account, [click here](https://data.gov.au/user/register)`;
    } else if (
        authConfig.isAuthPlugin &&
        authConfig.config.authenticationMethod === "PASSWORD"
    ) {
        providerName = authConfig.config.name;

        usernameLabel = authConfig.config.loginFormUsernameFieldLabel
            ? authConfig.config.loginFormUsernameFieldLabel
            : usernameLabel;

        passwordLabel = authConfig.config.loginFormPasswordFieldLabel
            ? authConfig.config.loginFormPasswordFieldLabel
            : passwordLabel;

        loginFormExtraInfoHeading = authConfig.config.loginFormExtraInfoHeading
            ? authConfig.config.loginFormExtraInfoHeading
            : loginFormExtraInfoHeading;

        loginFormExtraInfoContent = authConfig.config.loginFormExtraInfoContent
            ? authConfig.config.loginFormExtraInfoContent
            : loginFormExtraInfoContent;
    } else {
        return null;
    }

    return (
        <div className="col-sm-6 col-md-5">
            <h2>Sign In with {providerName}</h2>
            <form
                action={makeLoginUrl(authConfig)}
                method="post"
                className="login__form"
            >
                <div className="login__input-group input-group">
                    <div className="input-group-addon">
                        <span className="glyphicon glyphicon-user" />
                    </div>
                    <label htmlFor="username">{usernameLabel}</label>
                    <input
                        className="au-text-input au-text-input--block"
                        id="username"
                        type="text"
                        placeholder={usernameLabel}
                        name="username"
                    />
                </div>
                <div className="login__input-group input-group">
                    <div className="input-group-addon">
                        <span className="glyphicon glyphicon-lock" />
                    </div>
                    <label htmlFor="password">{passwordLabel}</label>
                    <input
                        className="au-text-input au-text-input--block"
                        type="password"
                        name="password"
                        placeholder="Password"
                    />
                </div>
                <div className="pull-right">
                    <input type="submit" className="au-btn" value="Sign in" />
                </div>
            </form>
            <br />
            {loginFormExtraInfoHeading || loginFormExtraInfoContent ? (
                <>
                    {loginFormExtraInfoHeading ? (
                        <h2>{loginFormExtraInfoHeading}</h2>
                    ) : null}
                    {loginFormExtraInfoContent ? (
                        <p
                            dangerouslySetInnerHTML={{
                                __html: markdownToHtml(
                                    loginFormExtraInfoContent
                                )
                            }}
                        />
                    ) : null}
                </>
            ) : null}
        </div>
    );
};

type LoginOptionList = {
    authConfigItems: AuthConfig[] | undefined;
};

export default function Login(props) {
    const {
        result: authConfigItems,
        loading: isProvidersLoading,
        error: providersLoadingError
    } = useAsync(async () => {
        const authPlugins = (await getAuthPlugins()).map(
            (item) =>
                ({
                    isAuthPlugin: true,
                    config: item
                } as AuthConfig)
        );

        const providers = (await getAuthProviders()).map(
            (item) =>
                ({
                    isAuthPlugin: false,
                    config: item
                } as AuthConfig)
        );

        const commonAuthModuleConfig = providers.concat(authPlugins);

        let defaultSelectedAuthConfig = getDefaultLoginFormProvider(
            commonAuthModuleConfig
        );

        if (!defaultSelectedAuthConfig && commonAuthModuleConfig.length) {
            defaultSelectedAuthConfig = commonAuthModuleConfig[0];
        }

        setSelectedAuthConfig(defaultSelectedAuthConfig);

        return commonAuthModuleConfig;
    }, []);

    const [
        selectedAuthConfig,
        setSelectedAuthConfig
    ] = useState<AuthConfig | null>(null);

    const LoginOptionList: FunctionComponent<LoginOptionList> = (props) => {
        const { authConfigItems } = props;

        if (!authConfigItems?.length) {
            return null;
        }

        return (
            <ul className="login__providers">
                {authConfigItems.map((item) => {
                    if (!item.isAuthPlugin && item.config === "internal") {
                        return (
                            <li className="login__provider">
                                <a onClick={() => setSelectedAuthConfig(item)}>
                                    <img
                                        src={magdaLogo}
                                        className="login__logo"
                                        alt="logo"
                                    />
                                    Magda
                                </a>
                            </li>
                        );
                    } else if (!item.isAuthPlugin && item.config === "ckan") {
                        return (
                            <li className="login__provider">
                                <a onClick={() => setSelectedAuthConfig(item)}>
                                    <img
                                        src={ckanLogo}
                                        className="login__logo"
                                        alt="logo"
                                    />
                                    Data.gov.au / Ckan
                                </a>
                            </li>
                        );
                    } else if (!item.isAuthPlugin) {
                        let logo = genericLogo;
                        let name = ucwords(item.config);
                        switch (item.config) {
                            case "facebook":
                                logo = fbLogo;
                                break;
                            case "google":
                                logo = googleLogo;
                                break;
                            case "arcgis":
                                logo = arcgisLogo;
                                name = "Esri";
                                break;
                            case "aaf":
                                logo = aafLogo;
                                name = "AAF";
                                break;
                            // vanguard will use the default values
                        }

                        return (
                            <li className="login__provider">
                                <CommonLink href={makeLoginUrl(item)}>
                                    <img
                                        src={logo}
                                        className="login__logo"
                                        alt="logo"
                                    />
                                    {name}
                                </CommonLink>
                            </li>
                        );
                    } else {
                        if (item.config.authenticationMethod === "PASSWORD") {
                            return (
                                <li className="login__provider">
                                    <a
                                        onClick={() =>
                                            setSelectedAuthConfig(item)
                                        }
                                    >
                                        <img
                                            src={item.config.iconUrl}
                                            className="login__logo"
                                            alt="logo"
                                        />
                                        {item.config.name}
                                    </a>
                                </li>
                            );
                        } else if (
                            item.config.authenticationMethod ===
                            "IDP-URI-REDIRECTION"
                        ) {
                            return (
                                <li className="login__provider">
                                    <CommonLink href={makeLoginUrl(item)}>
                                        <img
                                            src={item.config.iconUrl}
                                            className="login__logo"
                                            alt="logo"
                                        />
                                        {item.config.name}
                                    </CommonLink>
                                </li>
                            );
                        } else if (
                            item.config.authenticationMethod === "QR-CODE"
                        ) {
                            return (
                                <li className="login__provider">
                                    <a
                                        onClick={() =>
                                            setSelectedAuthConfig(item)
                                        }
                                    >
                                        <img
                                            src={item.config.iconUrl}
                                            className="login__logo"
                                            alt="logo"
                                        />
                                        {item.config.name}
                                    </a>
                                </li>
                            );
                        } else {
                            return (
                                <li className="login__provider">{`Unrecognised Auth Plugin: ${item.config.name}`}</li>
                            );
                        }
                    }
                })}
            </ul>
        );
    };

    function renderSelectedAuthConfig() {
        if (!selectedAuthConfig) {
            if (authConfigItems?.length) {
                return (
                    <p>Please select an authentication option from the list.</p>
                );
            } else {
                return (
                    <p>
                        Cannot find any installed authentication plugin or
                        provider.
                    </p>
                );
            }
        } else {
            return (
                <>
                    <LoginFormArea authConfig={selectedAuthConfig} />
                </>
            );
        }
    }

    return (
        <div className="row login__row">
            {props.signInError && (
                <div className="col-xs-12">
                    <div className="au-body au-page-alerts au-page-alerts--error">
                        <p>Sign In Failed: {props.signInError} </p>
                    </div>
                </div>
            )}
            {isProvidersLoading ? (
                <div className="col-xs-12">
                    <p>Loading available authentication providers...</p>
                </div>
            ) : null}
            {!isProvidersLoading && providersLoadingError ? (
                <div className="col-xs-12">
                    <div className="au-body au-page-alerts au-page-alerts--error">
                        <p>
                            Failed to load authentication providers:{" "}
                            {"" + providersLoadingError}{" "}
                        </p>
                    </div>
                </div>
            ) : null}
            {!isProvidersLoading ? (
                <div className="col-sm-6 col-md-5">
                    <h2>Sign In / Register Providers</h2>
                    <LoginOptionList authConfigItems={authConfigItems} />
                </div>
            ) : null}

            {renderSelectedAuthConfig()}
        </div>
    );
}
