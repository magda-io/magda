import express, { Request, Response } from "express";
import createBaseProxy from "./createBaseProxy";
import { requireUnconditionalAuthDecision } from "magda-typescript-common/src/authorization-api/authMiddleware";
import AuthDecisionQueryClient from "magda-typescript-common/src/opa/AuthDecisionQueryClient";
import { GenericProxyRouterOptions } from "./createGenericProxyRouter";
import buildJwt from "magda-typescript-common/src/session/buildJwt";

interface OptionsType {
    gatewayUrl: string;
    apiRouterOptions: GenericProxyRouterOptions;
    authClient: AuthDecisionQueryClient;
}

export default function createOpenfaasGatewayProxy(
    options: OptionsType
): express.Router {
    const router = express.Router();
    const proxy = createBaseProxy(options.apiRouterOptions);
    const jwtSecret = options.apiRouterOptions.jwtSecret;

    function createJwtToken(req: Request) {
        if (jwtSecret && req.user) {
            return buildJwt(jwtSecret, req.user.id, {
                session: req.user.session
            });
        }
        return undefined;
    }

    options.apiRouterOptions.authenticator.applyToRoute(router);

    proxy.on("proxyReq", (proxyReq, req: any, _res, _options) => {
        if (jwtSecret && req.user) {
            proxyReq.setHeader("X-Magda-Session", createJwtToken(req));
        }
    });

    router.get(
        "/system/functions",
        requireUnconditionalAuthDecision(
            options.authClient,
            (req: Request, res: Response) => ({
                operationUri: "object/faas/function/read",
                jwtToken: createJwtToken(req)
            })
        ),
        (req: express.Request, res: express.Response) => {
            proxy.web(req, res, { target: options.gatewayUrl });
        }
    );

    router.post(
        "/system/functions",
        requireUnconditionalAuthDecision(
            options.authClient,
            (req: Request, res: Response) => ({
                operationUri: "object/faas/function/create",
                jwtToken: createJwtToken(req)
            })
        ),
        (req: express.Request, res: express.Response) => {
            proxy.web(req, res, { target: options.gatewayUrl });
        }
    );

    router.put(
        "/system/functions",
        requireUnconditionalAuthDecision(
            options.authClient,
            (req: Request, res: Response) => ({
                operationUri: "object/faas/function/update",
                jwtToken: createJwtToken(req)
            })
        ),
        (req: express.Request, res: express.Response) => {
            proxy.web(req, res, { target: options.gatewayUrl });
        }
    );

    router.delete(
        "/system/functions",
        requireUnconditionalAuthDecision(
            options.authClient,
            (req: Request, res: Response) => ({
                operationUri: "object/faas/function/delete",
                jwtToken: createJwtToken(req)
            })
        ),
        (req: express.Request, res: express.Response) => {
            proxy.web(req, res, { target: options.gatewayUrl });
        }
    );

    router.post(
        "/function/:functionName",
        requireUnconditionalAuthDecision(
            options.authClient,
            (req: Request, res: Response) => ({
                operationUri: "object/faas/function/invoke",
                jwtToken: createJwtToken(req)
            })
        ),
        (req: express.Request, res: express.Response) => {
            proxy.web(req, res, { target: options.gatewayUrl });
        }
    );

    router.post(
        "/async-function/:functionName",
        requireUnconditionalAuthDecision(
            options.authClient,
            (req: Request, res: Response) => ({
                operationUri: "object/faas/function/invoke",
                jwtToken: createJwtToken(req)
            })
        ),
        (req: express.Request, res: express.Response) => {
            proxy.web(req, res, { target: options.gatewayUrl });
        }
    );

    router.get(
        "/system/function/:functionName",
        requireUnconditionalAuthDecision(
            options.authClient,
            (req: Request, res: Response) => ({
                operationUri: "object/faas/function/read",
                jwtToken: createJwtToken(req)
            })
        ),
        (req: express.Request, res: express.Response) => {
            proxy.web(req, res, { target: options.gatewayUrl });
        }
    );

    router.get("/healthz", (req: express.Request, res: express.Response) => {
        proxy.web(req, res, { target: options.gatewayUrl });
    });

    return router;
}
