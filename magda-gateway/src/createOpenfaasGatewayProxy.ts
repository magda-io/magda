import express from "express";
import createBaseProxy from "./createBaseProxy";
import { mustBeAdmin } from "magda-typescript-common/src/authorization-api/authMiddleware";
import { ApiRouterOptions } from "./createApiRouter";

interface OptionsType {
    gatewayUrl: string;
    baseAuthUrl: string;
    allowAdminOnly?: boolean;
    apiRouterOptions: ApiRouterOptions;
}

export default function createOpenfaasGatewayProxy(
    options: OptionsType
): express.Router {
    const router = express.Router();
    const proxy = createBaseProxy(options.apiRouterOptions);

    if (options.allowAdminOnly) {
        options.apiRouterOptions.authenticator.applyToRoute(router);
        router.use(
            mustBeAdmin(options.baseAuthUrl, options.apiRouterOptions.jwtSecret)
        );
    }

    router.all("*", (req: express.Request, res: express.Response) => {
        proxy.web(req, res, { target: options.gatewayUrl });
    });

    return router;
}
