import httpProxy from "http-proxy";
import { Router, Request, Response } from "express";

/**
 * Different type of AuthenticationMethod:
 * - IDP-URI-REDIRECTION: the plugin will rediredct user agent to idp (identity provider) for authentication. e.g. Google & fackebook oauth etc.
 *   - This is the default method.
 * - PASSWORD: the plugin expect frontend do a form post that contains username & password to the plugin for authentication
 * - REPLY-PARTY-QR-CODE: the plugin offers a url for QR-code generation and expect the user scan the QR code with a mobile app to complete the authentication.
 *   - Once the QR-code is generated, the frontend is expected to polling a predefined plugin url to check whether the authentication is complete.
 */
export type AuthenticationMethod =
    | "IDP-URI-REDIRECTION"
    | "PASSWORD"
    | "REPLY-PARTY-QR-CODE";

export type AuthPluginConfig = {
    // plugin key. allowed chars [a-zA-Z\-]
    key: string;
    // plugin display name
    name: string;
    // plugin serving base url. Getway will forward all request to it
    baseUrl: string;
    authenticationMethod: AuthenticationMethod;

    qrCodeUrlPath?: string;
};

export interface AuthPluginRouterOptions {
    plugins: AuthPluginConfig[];
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

    function proxyPluginRoute(pluginKey: string, accessUrl: string) {
        const pluginItemRouter = Router();

        pluginItemRouter.all("*", (req: Request, res: Response) => {
            proxy.web(req, res, { target: accessUrl });
        });

        authPluginsRouter.use(pluginKey, pluginItemRouter);

        console.log("Install Auth Plugin", pluginKey, "at", accessUrl);

        return pluginItemRouter;
    }

    if (options?.plugins?.length) {
        options.plugins.forEach((plugin) =>
            proxyPluginRoute(plugin.key, plugin.baseUrl)
        );
    }

    return authPluginsRouter;
}
