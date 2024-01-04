import { Router } from "express";
import fetch from "cross-fetch";
import addTrailingSlash from "magda-typescript-common/src/addTrailingSlash.js";
import Authenticator from "./Authenticator.js";
import createAuthPluginRouter, {
    AuthPluginBasicConfig,
    AuthPluginConfig
} from "./createAuthPluginRouter.js";

export interface AuthRouterOptions {
    authenticator: Authenticator;
    plugins: AuthPluginBasicConfig[];
}

export default function createAuthRouter(options: AuthRouterOptions): Router {
    const authRouter: Router = Router();
    const authenticatorMiddleware =
        options.authenticator.authenticatorMiddleware;

    /**
     * @apiGroup Authentication API
     * @api {get} https://<host>/auth/plugins Get the list of available authentication plugins
     * @apiDescription Returns all installed authentication plugins. This endpoint is only available when gateway `enableAuthEndpoint`=true
     *
     * @apiSuccessExample {json} 200
     *    [{
     *        "key":"google",
     *        "name":"Google",
     *        "iconUrl":"http://xxx/sds/sds.jpg",
     *        "authenticationMethod": "IDP-URI-REDIRECTION"
     *    }]
     *
     */
    authRouter.get("/plugins", async (req, res) => {
        if (!options?.plugins?.length) {
            res.json([]);
            return;
        }

        const data = await Promise.all(
            options.plugins.map(async (plugin) => {
                try {
                    const res = await fetch(
                        addTrailingSlash(plugin.baseUrl) + "config"
                    );
                    const data = (await res.json()) as AuthPluginConfig;
                    return {
                        ...data,
                        key: plugin.key
                    };
                } catch (e) {
                    // when failed to load, skip loading this config item by returning null
                    console.error(
                        `Failed to load authentication plugin config from ${plugin.baseUrl}: ` +
                            e
                    );
                    return null;
                }
            })
        );

        res.json(data.filter((item) => !!item));
    });

    // setup auth plugin routes
    if (options?.plugins?.length) {
        authRouter.use(
            "/login/plugin",
            createAuthPluginRouter({
                plugins: options.plugins
            })
        );
    }

    /**
     * @apiGroup Authentication API
     * @api {get} https://<host>/auth/logout Explicitly logout current user session
     * @apiDescription Returns result of logout action.
     * This endpoint implements the behaviour that is described in [this doc](https://github.com/magda-io/magda/blob/master/docs/docs/authentication-plugin-spec.md#get-logout-endpoint-optional)
     * in order to support auth plugin logout process.
     * When the `redirect` query parameter does not present, this middleware should be compatible with the behaviour prior to version 0.0.60.
     * i.e.:
     * - Turn off Magda session only without forwarding any requests to auth plugins
     * - Response a JSON response (that indicates the outcome of the logout action) instead of redirect users.
     * This endpoint is only available when gateway `enableAuthEndpoint`=true
     *
     * @apiSuccessExample {json} 200
     *    {
     *        "isError": false
     *    }
     *
     * @apiErrorExample {json} 500
     *    {
     *        "isError": true,
     *        "errorCode": 500,
     *        "errorMessage": "xxxxxx"
     *    }
     *
     */
    authRouter.get("/logout", authenticatorMiddleware);

    return authRouter;
}
