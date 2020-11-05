import httpProxy from "http-proxy";
import { Router, Request, Response } from "express";

/**
 * Different type of AuthenticationMethod:
 * - IDP-URI-REDIRECTION: the plugin will rediredct user agent to idp (identity provider) for authentication. e.g. Google & fackebook oauth etc.
 *   - This is the default method.
 * - PASSWORD: the plugin expect frontend do a form post that contains username & password to the plugin for authentication
 * - QR-CODE: the plugin offers a url that is used by the frontend to request auth challenge data. The data will be encoded into a QR-code image and expect the user scan the QR code with a mobile app to complete the authentication request.
 *   - Once the QR-code image is generated, the frontend is expected to start polling a pre-defined plugin url to check whether the authentication is complete or not.
 */
export type AuthenticationMethod =
    | "IDP-URI-REDIRECTION"
    | "PASSWORD"
    | "QR-CODE";

/**
 * AuthPluginConfig is retrieved by fetching config data from auth plugin using `AuthPluginBasicConfig.baseUrl` info below.
 * Gateway will tried to access /auth/login/plugin/[plugin-name]/config to retrieve the config and then expose to frontend via `/auth/plugins` API
 */
export interface AuthPluginConfig
    extends Omit<AuthPluginBasicConfig, "baseUrl"> {
    // plugin display name
    name: string;
    iconUrl: string;
    authenticationMethod: AuthenticationMethod;
    loginFormExtraInfoHeading?: string;
    loginFormExtraInfoContent?: string;
    loginFormUsernameFieldLabel?: string;
    loginFormPasswordFieldLabel?: string;
    qrCodeImgDataRequestUrl?: string; // Compulsory when authenticationMethod = "QR-CODE"
    qrCodeAuthResultPollUrl?: string; // Compulsory when authenticationMethod = "QR-CODE"
    qrCodeExtraInfoHeading?: string;
    qrCodeExtraInfoContent?: string;
}

/**
 * Basic Auth Plugin are the config info that supplied to Gateway
 * via [authPlugins](https://github.com/magda-io/magda/tree/master/deploy/helm/internal-charts/gateway) helm chart config
 */
export type AuthPluginBasicConfig = {
    // plugin key. allowed chars [a-zA-Z\-]
    key: string;
    // plugin serving base url. Getway will forward all request to it
    baseUrl: string;
};

export interface AuthPluginRouterOptions {
    plugins: AuthPluginBasicConfig[];
}

export default function createAuthPluginRouter(
    options: AuthPluginRouterOptions
): Router {
    const authPluginsRouter: Router = Router();

    const proxy = httpProxy.createProxyServer({
        prependUrl: false,
        changeOrigin: true
    } as httpProxy.ServerOptions);

    proxy.on("error", function (err: any, req: any, res: any) {
        res.writeHead(500, {
            "Content-Type": "text/plain"
        });

        console.error(err);

        res.end("Something went wrong with auth plugin router");
    });

    /**
     * Remove possible security sensitive headers
     */
    proxy.on("proxyRes", function (proxyRes, req, res) {
        Object.keys(proxyRes.headers).forEach((headerKey) => {
            const headerKeyLowerCase = headerKey.toLowerCase();
            if (
                headerKeyLowerCase === "x-powered-by" ||
                headerKeyLowerCase === "server"
            ) {
                proxyRes.headers[headerKey] = undefined;
            }
        });
    });

    function proxyPluginRoute(pluginKey: string, accessUrl: string) {
        const pluginItemRouter = Router();

        pluginItemRouter.all("*", (req: Request, res: Response) => {
            proxy.web(req, res, { target: accessUrl });
        });

        authPluginsRouter.use("/" + pluginKey, pluginItemRouter);

        console.log(
            "Install Auth Plugin",
            pluginKey,
            "at",
            `/auth/login/plugin/${pluginKey}`,
            "to",
            accessUrl
        );

        return pluginItemRouter;
    }

    if (options?.plugins?.length) {
        options.plugins.forEach((plugin) =>
            proxyPluginRoute(plugin.key, plugin.baseUrl)
        );
    }

    return authPluginsRouter;
}
