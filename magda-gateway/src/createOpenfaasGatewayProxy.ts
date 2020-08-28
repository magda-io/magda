import express from "express";
import createBaseProxy from "./createBaseProxy";
import { mustBeAdmin } from "magda-typescript-common/src/authorization-api/authMiddleware";
import { GenericProxyRouterOptions } from "./createGenericProxyRouter";
import buildJwt from "magda-typescript-common/src/session/buildJwt";

interface OptionsType {
    gatewayUrl: string;
    baseAuthUrl: string;
    allowAdminOnly?: boolean;
    apiRouterOptions: GenericProxyRouterOptions;
    jwtSecret: string;
}

export default function createOpenfaasGatewayProxy(
    options: OptionsType
): express.Router {
    const router = express.Router();
    const proxy = createBaseProxy(options.apiRouterOptions);
    const jwtSecret = options.jwtSecret;

    options.apiRouterOptions.authenticator.applyToRoute(router);

    proxy.on("proxyReq", (proxyReq, req: any, _res, _options) => {
        if (jwtSecret && req.user) {
            proxyReq.setHeader(
                "X-Magda-Session",
                buildJwt(jwtSecret, req.user.id, { session: req.user.session })
            );
        }
    });

    if (options.allowAdminOnly) {
        router.use(
            mustBeAdmin(options.baseAuthUrl, options.apiRouterOptions.jwtSecret)
        );
    }

    router.all("*", (req: express.Request, res: express.Response) => {
        proxy.web(req, res, { target: options.gatewayUrl });
    });

    return router;
}
