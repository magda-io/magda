import httpProxy from "http-proxy";
import { Router, Request, Response } from "express";
import setCookieParser from "set-cookie-parser";
import cookie from "cookie";
import {
    SessionCookieOptions,
    DEFAULT_SESSION_COOKIE_NAME
} from "./Authenticator";

export const EXPRESS_SESSION_DEFAULT_COOKIE_NAME: string = "connect.sid";
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
    cookieOptions: SessionCookieOptions;
    trustProxy?: boolean;
}

function isSecure(req: Request, trustProxy: boolean) {
    // socket is https server
    if ((req?.connection as any)?.encrypted) {
        return true;
    }

    // do not trust proxy
    if (trustProxy === false) {
        return false;
    }

    // no explicit trust; try req.secure from express
    if (trustProxy !== true) {
        return req.secure === true;
    }

    // read the proto from x-forwarded-proto header
    var header = (req.headers["x-forwarded-proto"] || "") as string;
    var index = header.indexOf(",");
    var proto =
        index !== -1
            ? header.substr(0, index).toLowerCase().trim()
            : header.toLowerCase().trim();

    return proto === "https";
}

export default function createAuthPluginRouter(
    options: AuthPluginRouterOptions
): Router {
    const trustProxy =
        typeof options.trustProxy === "boolean" ? options.trustProxy : true;
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
     * Reset Cookie on response using gateway config.
     * We only change session id cookie settings and leave all other cookies untouched.
     * It's possible to have more than one `Set-Cookie` headers in a response as long as the cookie name is different.
     * One Set-Cookie header can only set one cookie value with possible multiple settings.
     */
    proxy.on("proxyRes", function (proxyRes, req, res) {
        const cookies = setCookieParser.parse(proxyRes);

        if (!cookies?.length) {
            return;
        }

        let secure: boolean = false;
        if (options.cookieOptions.secure === "auto") {
            isSecure(req as any, trustProxy);
        } else if (typeof options.cookieOptions.secure === "boolean") {
            secure = options.cookieOptions.secure;
        }

        proxyRes.headers["set-cookie"] = cookies.map((cookieData) => {
            const { name, value, ...restOptions } = cookieData;
            if (name !== EXPRESS_SESSION_DEFAULT_COOKIE_NAME) {
                // not a session cookie
                return cookie.serialize(name, value, restOptions as any);
            } else {
                // overwritten session cookie settings with gateway cookie settings here:
                // https://github.com/magda-io/magda/blob/master/deploy/helm/internal-charts/gateway/README.md
                return cookie.serialize(DEFAULT_SESSION_COOKIE_NAME, value, {
                    ...options.cookieOptions,
                    secure
                });
            }
        });

        /**
         * Remove possible security sensitive headers
         */
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
