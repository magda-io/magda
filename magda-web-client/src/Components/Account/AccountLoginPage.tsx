import React, { useState, FunctionComponent } from "react";
import "./AccountLoginPage.scss";
import { convertAuthPluginApiUrl, getAuthPlugins } from "api-clients/AuthApis";
import { AuthPluginConfig } from "@magda/gateway/src/createAuthPluginRouter";
import { config, isBackendSameOrigin } from "config";
import { useAsync } from "react-async-hook";
import markdownToHtml from "@magda/typescript-common/dist/markdownToHtml.js";
import QrCodeLoginArea from "./QrCodeLoginArea";

const { baseUrl, baseExternalUrl, authPluginRedirectUrl } = config;

function getDefaultLoginFormProvider(
    authConfigItems: AuthPluginConfig[]
): AuthPluginConfig | null {
    const selectConfigItem = authConfigItems.find(
        (config) => config.authenticationMethod === "PASSWORD"
    );
    if (selectConfigItem) {
        return selectConfigItem;
    }

    return null;
}

const makeLoginUrl = (authConfig: AuthPluginConfig, redirectTo?: string) => {
    // auth plugins share the same gateway helm chart config [authPluginRedirectUrl](https://github.com/magda-io/magda/tree/master/deploy/helm/internal-charts/gateway)
    // We don't need to supply redirection url here unless
    // - the UI is served from different origin (domains) from backend.
    // - And the configured redirect URL is not an absolute url
    if (redirectTo) {
        if (
            isBackendSameOrigin ||
            redirectTo.toLowerCase().indexOf("http") === 0
        ) {
            return `${baseUrl}auth/login/plugin/${
                authConfig.key
            }?redirect=${encodeURIComponent(redirectTo)}`;
        } else {
            return `${baseUrl}auth/login/plugin/${
                authConfig.key
            }?redirect=${encodeURIComponent(
                baseExternalUrl +
                    (redirectTo[0] === "/"
                        ? redirectTo.substring(1)
                        : redirectTo)
            )}`;
        }
    }
    if (
        isBackendSameOrigin ||
        authPluginRedirectUrl.toLowerCase().indexOf("http") === 0
    ) {
        return `${baseUrl}auth/login/plugin/${authConfig.key}`;
    } else {
        return `${baseUrl}auth/login/plugin/${
            authConfig.key
        }?redirect=${encodeURIComponent(
            baseExternalUrl +
                (authPluginRedirectUrl[0] === "/"
                    ? authPluginRedirectUrl.substring(1)
                    : authPluginRedirectUrl)
        )}`;
    }
};

type LoginFormPropsType = {
    authConfig: AuthPluginConfig;
};

const LoginFormArea: FunctionComponent<LoginFormPropsType> = (props) => {
    const { authConfig } = props;

    let providerName = "";
    let usernameLabel = "User name";
    let passwordLabel = "Password";
    let loginFormExtraInfoHeading = "";
    let loginFormExtraInfoContent = "";

    if (authConfig.authenticationMethod === "PASSWORD") {
        providerName = authConfig.name;

        usernameLabel = authConfig.loginFormUsernameFieldLabel
            ? authConfig.loginFormUsernameFieldLabel
            : usernameLabel;

        passwordLabel = authConfig.loginFormPasswordFieldLabel
            ? authConfig.loginFormPasswordFieldLabel
            : passwordLabel;

        loginFormExtraInfoHeading = authConfig.loginFormExtraInfoHeading
            ? authConfig.loginFormExtraInfoHeading
            : loginFormExtraInfoHeading;

        loginFormExtraInfoContent = authConfig.loginFormExtraInfoContent
            ? authConfig.loginFormExtraInfoContent
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

type LoginOptionListPropsType = {
    authConfigItems: AuthPluginConfig[] | undefined;
    redirectTo?: string;
};

const isPasswordAuthItem = (config: AuthPluginConfig): boolean => {
    if (config.authenticationMethod === "PASSWORD") {
        return true;
    } else {
        return false;
    }
};

const getSortingStringFromAuthConfig = (config: AuthPluginConfig): string =>
    config.name;

export type PropsType = {
    signInError?: string;
    redirectTo?: string;
};

const AccountLoginPage: FunctionComponent<PropsType> = (props) => {
    const {
        result: authConfigItems,
        loading: isAuthPluginsLoading,
        error: authPluginsLoadingError
    } = useAsync(async () => {
        let authPlugins: AuthPluginConfig[] = [];

        try {
            authPlugins = await getAuthPlugins();
        } catch (e) {
            console.error(e);
        }

        let defaultSelectedAuthConfig = getDefaultLoginFormProvider(
            authPlugins
        );

        if (!defaultSelectedAuthConfig && authPlugins.length) {
            defaultSelectedAuthConfig = authPlugins[0];
        }

        function sortAuthConfigItems(
            a: AuthPluginConfig,
            b: AuthPluginConfig
        ): number {
            if (defaultSelectedAuthConfig === a) {
                // --- selected default provider / plugin always show as no.1
                return -1;
            } else if (defaultSelectedAuthConfig === b) {
                return 1;
            } else if (isPasswordAuthItem(a) && !isPasswordAuthItem(b)) {
                return -1;
            } else if (!isPasswordAuthItem(a) && isPasswordAuthItem(b)) {
                return 1;
            } else {
                return getSortingStringFromAuthConfig(a) <
                    getSortingStringFromAuthConfig(b)
                    ? -1
                    : 1;
            }
        }

        authPlugins.sort(sortAuthConfigItems);

        setSelectedAuthConfig(defaultSelectedAuthConfig);

        return authPlugins;
    }, []);

    const [
        selectedAuthConfig,
        setSelectedAuthConfig
    ] = useState<AuthPluginConfig | null>(null);

    const LoginOptionList: FunctionComponent<LoginOptionListPropsType> = (
        props
    ) => {
        const { authConfigItems } = props;

        if (!authConfigItems?.length) {
            return null;
        }

        return (
            <ul className="login__providers">
                {authConfigItems.map((item, idx) => {
                    if (item.authenticationMethod === "PASSWORD") {
                        return (
                            <li key={idx} className="login__provider">
                                <a onClick={() => setSelectedAuthConfig(item)}>
                                    <img
                                        src={convertAuthPluginApiUrl(
                                            item.key,
                                            item.iconUrl
                                        )}
                                        className="login__logo"
                                        alt="logo"
                                    />
                                    {item.name}
                                </a>
                            </li>
                        );
                    } else if (
                        item.authenticationMethod === "IDP-URI-REDIRECTION"
                    ) {
                        return (
                            <li key={idx} className="login__provider">
                                <a href={makeLoginUrl(item, props.redirectTo)}>
                                    <img
                                        src={convertAuthPluginApiUrl(
                                            item.key,
                                            item.iconUrl
                                        )}
                                        className="login__logo"
                                        alt="logo"
                                    />
                                    {item.name}
                                </a>
                            </li>
                        );
                    } else if (item.authenticationMethod === "QR-CODE") {
                        return (
                            <li key={idx} className="login__provider">
                                <a onClick={() => setSelectedAuthConfig(item)}>
                                    <img
                                        src={convertAuthPluginApiUrl(
                                            item.key,
                                            item.iconUrl
                                        )}
                                        className="login__logo"
                                        alt="logo"
                                    />
                                    {item.name}
                                </a>
                            </li>
                        );
                    } else {
                        return (
                            <li
                                key={idx}
                                className="login__provider"
                            >{`Unrecognised Auth Plugin: ${item.name}`}</li>
                        );
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
            }
            if (isAuthPluginsLoading) {
                return null;
            } else {
                return (
                    <p>
                        Cannot find any installed authentication plugin or
                        provider.
                    </p>
                );
            }
        } else if (isPasswordAuthItem(selectedAuthConfig)) {
            return (
                <>
                    <LoginFormArea authConfig={selectedAuthConfig} />
                </>
            );
        } else if (selectedAuthConfig.authenticationMethod === "QR-CODE") {
            return (
                <>
                    <QrCodeLoginArea authConfig={selectedAuthConfig} />
                </>
            );
        } else {
            return null;
        }
    }

    return (
        <div className="row login__row">
            {props?.signInError && (
                <div className="col-xs-12">
                    <div className="au-body au-page-alerts au-page-alerts--error">
                        <p>Error: {props.signInError} </p>
                    </div>
                </div>
            )}
            {isAuthPluginsLoading ? (
                <div className="col-xs-12">
                    <p>Loading available authentication options...</p>
                </div>
            ) : null}
            {!isAuthPluginsLoading && authPluginsLoadingError ? (
                <div className="col-xs-12">
                    <div className="au-body au-page-alerts au-page-alerts--error">
                        <p>
                            Failed to load authentication plugin:{" "}
                            {"" + authPluginsLoadingError}{" "}
                        </p>
                    </div>
                </div>
            ) : null}
            {!isAuthPluginsLoading ? (
                <div className="col-sm-6 col-md-5">
                    <h2>Sign In / Register Providers</h2>
                    <LoginOptionList
                        authConfigItems={authConfigItems}
                        redirectTo={props.redirectTo}
                    />
                </div>
            ) : null}

            {renderSelectedAuthConfig()}
        </div>
    );
};

export default AccountLoginPage;
