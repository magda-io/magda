import express, { Request, Response } from "express";
import createBaseProxy from "./createBaseProxy.js";
import { requireUnconditionalAuthDecision } from "magda-typescript-common/src/authorization-api/authMiddleware.js";
import AuthDecisionQueryClient from "magda-typescript-common/src/opa/AuthDecisionQueryClient.js";
import { GenericProxyRouterOptions } from "./createGenericProxyRouter.js";
import buildJwt from "magda-typescript-common/src/session/buildJwt.js";

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

    /**
     * @apiGroup FaaS Function
     * @api {get} /v0/openfaas/system/functions Get the info of all deployed functions
     * @apiDescription Returns a list of deployed FaaS functions
     * You need `object/faas/function/read` permission in order to access this API.
     *
     * @apiSuccessExample {json} 200
     *    [
     *       {
     *           "name": "nodeinfo",
     *           "image": "functions/nodeinfo:latest",
     *           "invocationCount": 1337,
     *           "replicas": 2,
     *           "availableReplicas": 2,
     *           "envProcess": "node main.js",
     *           "labels": {
     *             "foo": "bar"
     *           },
     *           "annotations": {
     *             "topics": "awesome-kafka-topic",
     *             "foo": "bar"
     *           }
     *       }
     *    ]
     *
     * @apiErrorExample {string} 500
     *    HTTP/1.1 500 Internal Server Error
     *
     * @apiErrorExample {string} 403
     *    you are not permitted to perform `object/faas/function/read` on required resources
     */
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

    /**
     * @apiGroup FaaS Function
     * @api {post} /v0/openfaas/system/functions Create/Deploy a function
     * @apiDescription Create/Deploy a function
     * You need `object/faas/function/create` permission in order to access this API.
     * You can also deploy FaaS function as the part of Magda deployment as a Helm Chart.
     * Please see [magda-function-template](https://github.com/magda-io/magda-function-template)
     *
     * @apiParamExample {json} Request-Example:
     *
     *  {
     *       "service": "nodeinfo",
     *       "network": "func_functions",
     *       "image": "functions/nodeinfo:latest",
     *       "envProcess": "node main.js",
     *       "envVars": {
     *           "additionalProp1": "string",
     *           "additionalProp2": "string",
     *           "additionalProp3": "string"
     *       },
     *       "constraints": [
     *           "node.platform.os == linux"
     *       ],
     *       "labels": {
     *           "foo": "bar"
     *       },
     *       "annotations": {
     *           "topics": "awesome-kafka-topic",
     *           "foo": "bar"
     *       },
     *       "secrets": [
     *           "secret-name-1"
     *       ],
     *       "registryAuth": "dXNlcjpwYXNzd29yZA==",
     *       "limits": {
     *           "memory": "128M",
     *           "cpu": "0.01"
     *       },
     *       "requests": {
     *           "memory": "128M",
     *           "cpu": "0.01"
     *       },
     *       "readOnlyRootFilesystem": true
     *   }
     *
     * @apiSuccessExample {string} 202
     *    HTTP/1.1 202 Accepted
     *
     * @apiErrorExample {string} 400
     *    HTTP/1.1 400 Bad Request
     *
     * @apiErrorExample {string} 500
     *    HTTP/1.1 500 Internal Server Error
     *
     * @apiErrorExample {string} 403
     *    you are not permitted to perform `object/faas/function/create` on required resources
     */
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

    /**
     * @apiGroup FaaS Function
     * @api {put} /v0/openfaas/system/functions Update a function
     * @apiDescription Update a deployed function
     * You need `object/faas/function/update` permission in order to access this API.
     *
     * @apiParamExample {json} Request-Example:
     *
     *  {
     *       "service": "nodeinfo",
     *       "network": "func_functions",
     *       "image": "functions/nodeinfo:latest",
     *       "envProcess": "node main.js",
     *       "envVars": {
     *           "additionalProp1": "string",
     *           "additionalProp2": "string",
     *           "additionalProp3": "string"
     *       },
     *       "constraints": [
     *           "node.platform.os == linux"
     *       ],
     *       "labels": {
     *           "foo": "bar"
     *       },
     *       "annotations": {
     *           "topics": "awesome-kafka-topic",
     *           "foo": "bar"
     *       },
     *       "secrets": [
     *           "secret-name-1"
     *       ],
     *       "registryAuth": "dXNlcjpwYXNzd29yZA==",
     *       "limits": {
     *           "memory": "128M",
     *           "cpu": "0.01"
     *       },
     *       "requests": {
     *           "memory": "128M",
     *           "cpu": "0.01"
     *       },
     *       "readOnlyRootFilesystem": true
     *   }
     *
     * @apiSuccessExample {string} 200
     *    HTTP/1.1 200 Accepted
     *
     * @apiErrorExample {string} 400
     *    HTTP/1.1 400 Bad Request
     *
     * @apiErrorExample {string} 404
     *    HTTP/1.1 404 Not Found
     *
     * @apiErrorExample {string} 500
     *    HTTP/1.1 500 Internal Server Error
     *
     * @apiErrorExample {string} 403
     *    you are not permitted to perform `object/faas/function/update` on required resources
     */
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

    /**
     * @apiGroup FaaS Function
     * @api {delete} /v0/openfaas/system/functions Delete a function
     * @apiDescription Delete a deployed function
     * You need `object/faas/function/delete` permission in order to access this API.
     *
     * @apiParamExample {json} Request-Example:
     *
     *  {
     *     "functionName": "nodeinfo"
     *  }
     *
     * @apiSuccessExample {string} 200
     *    HTTP/1.1 200 Accepted
     *
     * @apiErrorExample {string} 400
     *    HTTP/1.1 400 Bad Request
     *
     * @apiErrorExample {string} 404
     *    HTTP/1.1 404 Not Found
     *
     * @apiErrorExample {string} 500
     *    HTTP/1.1 500 Internal Server Error
     *
     * @apiErrorExample {string} 403
     *    you are not permitted to perform `object/faas/function/delete` on required resources
     */
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

    /**
     * @apiGroup FaaS Function
     * @api {post} /v0/openfaas/function/:functionName Invoke a function
     * @apiDescription Invoke a function
     * You need `object/faas/function/invoke` permission in order to access this API.
     *
     * @apiParam (path) {Number} functionName the name of the function
     * @apiParam (body) {any} [input] when invoke the function, you can optionally supply function input in HTTP request body.
     * The whole request body will be passed to the function as input. However, how body data is parsed depends on the mime type.
     *
     * @apiParamExample {json} Request-Example:
     *  // Content-Type: application/json
     *  {"hello": "world"}
     *
     * @apiSuccessExample {string} 200
     *    HTTP/1.1 200 Ok
     *    // HTTP response body contains value returned from function
     *
     * @apiErrorExample {string} 400
     *    HTTP/1.1 400 Bad Request
     *
     * @apiErrorExample {string} 404
     *    HTTP/1.1 404 Not Found
     *
     * @apiErrorExample {string} 500
     *    HTTP/1.1 500 Internal Server Error
     *
     * @apiErrorExample {string} 403
     *    you are not permitted to perform `object/faas/function/invoke` on required resources
     */
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

    /**
     * @apiGroup FaaS Function
     * @api {post} /v0/openfaas/async-function/:functionName Invoke a function asynchronously
     * @apiDescription Invoke a function asynchronously
     * You need `object/faas/function/invoke` permission in order to access this API.
     *
     * @apiParam (path) {Number} functionName the name of the function
     * @apiParam (header) {String} X-Callback-Url the call back url that the function return data will be posted to.
     * @apiParam (body) {any} [input] when invoke the function, you can optionally supply function input in HTTP request body.
     * The whole request body will be passed to the function as input. However, how body data is parsed depends on the mime type.
     *
     * @apiParamExample {json} Request-Example:
     *  // Content-Type: application/json
     *  {"hello": "world"}
     *
     * @apiSuccess (header) {String} X-Call-Id the call id that identify this invocation.
     * The same header will also be included by the notification request that is sent to the call back http url.
     *
     * @apiSuccessExample {string} 202
     *    HTTP/1.1 202 Accepted
     *    Request accepted and queued
     *
     * @apiErrorExample {string} 404
     *    HTTP/1.1 404 Not Found
     *
     * @apiErrorExample {string} 500
     *    HTTP/1.1 500 Internal Server Error
     *
     * @apiErrorExample {string} 403
     *    you are not permitted to perform `object/faas/function/invoke` on required resources
     */
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

    /**
     * @apiGroup FaaS Function
     * @api {get} /v0/openfaas/system/function/:functionName Get the info of a deployed function
     * @apiDescription Returns the info of a deployed function
     * You need `object/faas/function/read` permission in order to access this API.
     *
     * @apiParam (path) {Number} functionName the name of the function
     *
     * @apiSuccessExample {json} 200
     *       {
     *           "name": "nodeinfo",
     *           "image": "functions/nodeinfo:latest",
     *           "invocationCount": 1337,
     *           "replicas": 2,
     *           "availableReplicas": 2,
     *           "envProcess": "node main.js",
     *           "labels": {
     *             "foo": "bar"
     *           },
     *           "annotations": {
     *             "topics": "awesome-kafka-topic",
     *             "foo": "bar"
     *           }
     *       }
     *
     * @apiErrorExample {string} 500
     *    HTTP/1.1 500 Internal Server Error
     *
     * @apiErrorExample {string} 404
     *    HTTP/1.1 404 Not Found
     *
     * @apiErrorExample {string} 403
     *    you are not permitted to perform `object/faas/function/read` on required resources
     */
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
