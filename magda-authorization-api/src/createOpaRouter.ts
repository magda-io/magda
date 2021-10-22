import express from "express";
import { Router } from "express";
import _ from "lodash";
import Database from "./Database";
import { User } from "magda-typescript-common/src/authorization-api/model";
import { getUserSession } from "magda-typescript-common/src/session/GetUserSession";
import OpaCompileResponseParser from "magda-typescript-common/src/OpaCompileResponseParser";
import setResponseNoCache from "magda-typescript-common/src/express/setResponseNoCache";
import GenericError from "magda-typescript-common/src/authorization-api/GenericError";
import request, { RequestPromiseOptions } from "request-promise-native";
import bodyParser from "body-parser";
import objectPath from "object-path";

export interface OpaRouterOptions {
    opaUrl: string;
    database: Database;
    jwtSecret: string;
}

const opaRoutes = [
    {
        path: "/compile",
        method: "post"
    },
    {
        path: "/compile",
        method: "get"
    },
    {
        path: "/data/*",
        method: "get"
    },
    {
        path: "/data/*",
        method: "post"
    },
    {
        path: "/query",
        method: "get"
    },
    {
        path: "/query",
        method: "post"
    }
];

/**
 * 
 * @param options proxyReq: http.ClientRequest,
      req: http.IncomingMessage,
      res: http.ServerResponse,
      options: Server.ServerOptions
 */

export default function createOpaRouter(options: OpaRouterOptions): Router {
    const database = options.database;
    const router: Router = express.Router();
    const jwtSecret: string = options.jwtSecret;
    const opaUrl: string = options.opaUrl;

    router.use(bodyParser.json({ type: "application/json" }));

    function normaliseInputField(reqData: any) {
        if (reqData.input && typeof reqData.input === "object") return;
        reqData.input = {};
    }

    function processQueryParams(req: express.Request, reqData: any) {
        if (!req.query || !Object.keys(req.query).length) return null;

        const { q, input, unknowns, ...otherQueryParams } = req.query;

        if (q && typeof q === "string" && q.length) {
            reqData["query"] = q;
        }

        if (input && typeof input === "string" && input.length) {
            // --- supply whole input object as JSON string through `input` query param
            try {
                const inputData = JSON.parse(input);
                reqData.input = { ...reqData.input, ...inputData };
            } catch (e) {}
        } else {
            /**
             * Supply input as JSON path notion.
             * e.g. input.companyName=ABC&input.people.0.name=Joe will be converted to
             * input = {
             *   "companyName": "ABC",
             *   "people": [{
             *      "name": Joe
             *   }]
             * }
             */
            const data: any = {};
            Object.keys(req.query)
                .filter((key) => key.indexOf("input.") === 0)
                .forEach((key) => {
                    if (key.replace("input.", "").trim() === "") return;
                    objectPath.set(data, key, req.query[key]);
                });
            if (data.input && Object.keys(data.input).length) {
                reqData.input = { ...reqData.input, ...data.input };
            }
        }

        if (unknowns) {
            // --- could be a string or array of string
            if (_.isString(unknowns) && unknowns.length) {
                reqData["unknowns"] = [unknowns];
            } else if (_.isArray(unknowns) && unknowns.length) {
                reqData["unknowns"] = unknowns;
            }
        }

        if (!otherQueryParams || !Object.keys(otherQueryParams).length)
            return null;

        return otherQueryParams;
    }

    async function appendUserInfoToInput(req: express.Request) {
        const userInfo: User = await database.getCurrentUserInfo(
            req,
            jwtSecret
        );

        let reqData: any = {};
        const contentType = req.get("content-type");

        const reqOpts: request.RequestPromiseOptions = {
            method: "post",
            resolveWithFullResponse: true
        };

        // --- merge userInfo into possible income input data via POST
        if (
            typeof req.body === "object" &&
            contentType &&
            contentType.toLowerCase() === "application/json"
        ) {
            reqData = req.body;
        }

        try {
            const reqQueryParams: any = processQueryParams(req, reqData);

            if (reqQueryParams) {
                // --- if still extra query params left, pass to opa
                reqOpts.qs = reqQueryParams;
            }
        } catch (e) {
            throw new Error(`Failed to process query parameters: ${e}`);
        }

        normaliseInputField(reqData);

        reqData.input.user = userInfo;
        reqData.input.user.roles = userInfo.roles.map((role) => role.id);

        const sessionClaim = getUserSession(req, jwtSecret).valueOr({});

        reqData.input.user.session = sessionClaim.session;

        reqData.input.timestamp = Date.now();

        reqOpts.json = reqData;

        return reqOpts;
    }

    async function proxyToOpa(
        req: express.Request,
        res: express.Response,
        reqOpts: RequestPromiseOptions
    ) {
        try {
            // -- request's pipe api doesn't work well with chunked response
            const fullResponse = await request(
                `${opaUrl}v1${req.path}`,
                reqOpts
            );
            if (
                req.path === "/compile" &&
                req.query.printRule &&
                fullResponse.statusCode === 200
            ) {
                // --- output human readable rules for debugging / investigation
                // --- AST is good for a program to process but too long for a human to read
                // --- query string parameter `printRule` contains the rule full name that you want to output
                const parser = new OpaCompileResponseParser();
                parser.parse(fullResponse.body);
                res.status(fullResponse.statusCode).send(
                    parser.evaluateRuleAsHumanReadableString(
                        req.query.printRule as string
                    )
                );
            } else {
                res.status(fullResponse.statusCode).send(fullResponse.body);
            }
        } catch (e) {
            console.error(e);
            res.status(500).send(`Failed to proxy request to OPA`);
        }
    }

    async function proxyRequest(req: express.Request, res: express.Response) {
        try {
            setResponseNoCache(res);
            const reqOpts = await appendUserInfoToInput(req);
            await proxyToOpa(req, res, reqOpts);
        } catch (e) {
            res.status(e.statusCode || 500).send(
                `Failed to proxy OPA request: ${e}`
            );
        }
    }

    /**
     * @apiGroup Auth
     * @api {post} /v0/auth/opa/decision[/path...] Get Auth Decision From OPA
     * @apiDescription Ask OPA ([Open Policy Agent](https://www.openpolicyagent.org/)) make authorisation decision on proposed resource operation URI.
     * The resource operation URI is supplied as part of request URL path.
     * e.g. a request sent to URL `https://<host>/api/v0/auth/opa/decision/object/dataset/draft/read` indicates an authorisation decision for is sought:
     * - operation uri: `object/dataset/draft/read`
     * - resource uri: `object/dataset/draft`
     *
     * The `resource uri` & `operation uri` info together with:
     * - other optional extra context data supplied
     * - current user profile. e.g. roles & permissions
     *
     * will be used to construct the context data object `input` that will be used to assist OPA's auth decision making.
     *
     * Regardless the `operation uri` supplied, this endpoint will always ask OPA to make decision using entrypoint policy `entrypoint/allow.rego` at policy directory root.
     * The `entrypoint/allow.rego` should be responsible for delegating the designated policy to make the actual auth decision for a particular type of resource.
     *
     * e.g. The default policy `entrypoint/allow.rego` will delegate polciy `object/dataset/allow.rego` to make decision for operation uri: `object/dataset/draft/read`.
     *
     * Please note: you can [replace built-in policy files](https://github.com/magda-io/magda/blob/master/docs/docs/how-to-add-custom-opa-policies.md) (including `entrypoint/allow.rego`) when deploy Magda with helm config.
     *
     * > This API endpoint is also available as a HTTP GET endpoint. You can access the same functionality via the GET endpoint except not being able to supply parameters via HTTP request body.
     *
     * @apiParam (Request URL Path) {String} path The URI of the resource operation that you propose to perform.
     *  From this URI (e.g. `object/dataset/draft/read`), we can also work out resource URI(e.g. `object/dataset/draft`).
     *  Depends on policy logic, URI pattern (e.g. `object/dataset/*&#47;read`) might be supported.
     *  > If you request the decision for a non-exist resource type, the default policy will evaluate to `false` (denied).
     *
     * @apiQuery (Query String Parameters) {String} [operationUri] Use to supply / overwrite the operation uri.
     *  Any parameters supplied via `Query String Parameters` have higher priority. Thus, can overwrite the same parameter supplied via `Request Body JSON`.
     *  However, `operationUri` supplied via `Query String Parameters` can't overwrite the `operationUri` supplied via `Request URL Path`.
     * @apiParam (Query String Parameters) {String} [resourceUri] Use to supply / overwrite the resource uri.
     * @apiParam (Query String Parameters) {String[]} [unknowns] Use to supply A list of references that should be considered as "unknown" during the policy evaluation.
     * More details please see `unknowns` parameter in `Request Body JSON` section below.
     * > Please note: you can supply an array by a query string like `unknowns=ref1&unknowns=ref2`
     *
     * @apiParam (Request Body JSON) {String[]} [unknowns] A list of references that should be considered as "unknown" during the policy evaluation.
     * If a conclusive/unconditional auth decision can't be made without knowing "unknown" data, the residual rules of the "partial evaluation" result will be responded in [rego](https://www.openpolicyagent.org/docs/latest/policy-language/) AST JSON format.
     * e.g. When `unknowns=["input.object.dataset"]`, any rules related to dataset's attributes will be kept and output as residual rules, unless existing context info is sufficient to make a conclusive/unconditional auth decision (e.g. admin can access all datasets the values of regardless dataset attributes).
     * > Please note: When `unknowns` is NOT supplied, this endpoint will auto-generate a JSON path that is made up of string "input" and first 2 segments of `operationUri` as the unknown reference.
     * > e.g. When `operationUri` = `object/dataset/draft/read` and `unknowns` parameter is not supplied, by default, this endpoint will set `unknowns` parameter's value to array ["input.object.dataset"].
     * > However, when extra context data is supplied as part request data at field `input.object.dataset`, the `unknowns` will not be set.
     * > If you prevent the endpoint from auto-generating `unknowns`, you can supply `unknowns` parameter as an empty string.
     *
     * @apiParam (Request Body JSON) {Object} [input] OPA "`input` data". Use to provide extra context data to support the auth decison making.
     * e.g. When you need to make decision on one particular dataset (rather than a group of dataset), you can supply the `input` data object as the following:
     * ```json
     * {
     *   "object": {
     *     "dataset": {
     *       // all dataset attributes
     *       ...
     *     }
     *   }
     * }
     * ```
     *
     * > Please note: It's not possible to overwrite system generated context data fields via `input` data object.
     * > e.g:
     * > - `input.user`
     * > - `input.timestamp`
     *
     * @apiSuccess (Success JSON Response Body) {bool} hasResidualRules indicates whether or not the policy engine can make a conclusive/unconditional auth decision.
     *  When a conclusive/unconditional auth decision is made (i.e. `hasResidualRules`=`false`), the auth decision is returned as policy evaluation value in `result` field.
     *  Usually, `true` means the operation should be `allowed`.
     *
     * @apiSuccess (Success JSON Response Body) {any} [result] Only presents when `hasResidualRules`=`false`.
     *  The result field contains the policy evaluation result value. `true` means th eoperation is allowed and `false` means otherwise.
     *  By default, it should be in `bool` type. However, you can opt to overwite the policy to return other type of data.
     *
     * @apiSuccess (Success JSON Response Body) {object[]} [residualRules] Only presents when `hasResidualRules`=`true`.
     * A list of residual rules as the result of the partial evaluation of policy due to `unknowns`.
     * The residual rules can be used to generate storage engine DSL (e.g. SQL or Elasticsearch DSL) for policy enforcement.
     *
     * @apiSuccessExample {json} Successful Response Example: a conclusive/unconditional auth decision is made
     *    {
     *       "hasResidualRules" : false,
     *       "result": true // -- the evaluation value of the policy. By default, `true` means operation should be `allowed`.
     *    }
     *
     * @apiSuccessExample {json} Successful Response Example: Partial Evaluation Result
     *
     * {
     *    "hasResidualRules": true,
     *    "residualRules": [{"default":true,"head":{"name":"allow","value":{"type":"boolean","value":false}},"body":[{"terms":{"type":"boolean","value":true},"index":0}]},{"head":{"name":"allow","value":{"type":"boolean","value":true}},"body":[{"terms":[{"type":"ref","value":[{"type":"var","value":"eq"}]},{"type":"ref","value":[{"type":"var","value":"input"},{"type":"string","value":"object"},{"type":"string","value":"dataset"},{"type":"string","value":"publishingState"}]},{"type":"string","value":"published"}],"index":0}]}]
     * }
     *
     *
     * @apiErrorExample {string} Status Code: 500/400
     *    Failed to get auth decision: xxxxxxxxx
     */
    async function getAuthDecision(
        req: express.Request,
        res: express.Response
    ) {
        try {
            setResponseNoCache(res);

            let operationUri = req.params[0];
            if (
                !operationUri &&
                req?.query?.operationUri &&
                typeof req.query.operationUri == "string"
            ) {
                operationUri = req.query.operationUri;
            } else if (
                !operationUri &&
                req?.body?.operationUri &&
                typeof req.body.operationUri == "string"
            ) {
                operationUri = req.body.operationUri;
            }

            operationUri = operationUri.trim();

            if (operationUri === "/") {
                throw new GenericError("`/` is not valid `operationUri`", 400);
            }

            if (!operationUri) {
                throw new GenericError(
                    "Please specify `operationUri` for the request",
                    400
                );
            }

            if (operationUri[0] === "/") {
                operationUri = operationUri.substr(1);
            }

            const opUriParts = operationUri.split("/");

            let resourceUri =
                opUriParts.length > 1
                    ? opUriParts.slice(0, opUriParts.length - 1).join("/")
                    : opUriParts[0];

            if (
                req?.query?.resourceUri &&
                typeof req.query.resourceUri == "string"
            ) {
                resourceUri = req.query.resourceUri;
            } else if (
                req?.body?.resourceUri &&
                typeof req.body.resourceUri == "string"
            ) {
                resourceUri = req.body.resourceUri;
            }

            const reqOpts = await appendUserInfoToInput(req);
            reqOpts.json.operationUri = operationUri;
            reqOpts.json.resourceUri = resourceUri;

            /**
             * By default, we will auto-generate `unknowns` reference list.
             * The auto-generated `unknowns` reference list will contains a JSON path that is made up of string "input" and first 2 segments of `operationUri`.
             * e.g. if `operationUri` is `object/dataset/draft/read`, the `unknowns`=["input.object.dataset"]
             *
             *
             * We will not auto-generate `unknowns`, when:
             * - `req.query.unknowns` (query string parameter) or `req.body.unknowns` (JSON request body) has set to empty string
             * - OR non-empty `unknowns` is supplied either via query string or request body.
             * - OR context data has been supplied via request body for the auto-generated unknown reference.
             *   - e.g. When `operationUri` is `object/dataset/draft/read` and the user supplies `dataset` object at `input.object`,
             *     there is no point to set ["input.object.dataset"] as `unknowns`, because it's supplied by the user.
             */
            const autoGenerateUnknowns =
                req?.query?.unknowns === "" ||
                req?.body?.unknowns === "" ||
                reqOpts?.json?.unknowns ||
                // test whether the context data match the auto-generated unknown json path has been supplied
                objectPath.has(
                    reqOpts.json.input,
                    opUriParts.length > 2 ? opUriParts.slice(0, 2) : opUriParts
                )
                    ? false
                    : true;

            if (autoGenerateUnknowns) {
                const unknownRef = [
                    "input",
                    ...(opUriParts.length > 2
                        ? opUriParts.slice(0, 2)
                        : opUriParts)
                ].join(".");
                reqOpts.json.unknowns = [unknownRef];
            }

            reqOpts.json.query = "data.entrypoint.allow";

            // -- request's pipe api doesn't work well with opa's chunked response
            const fullResponse = await request(`${opaUrl}v1/compile`, reqOpts);

            if (
                fullResponse.statusCode >= 200 &&
                fullResponse.statusCode < 300
            ) {
                if (req?.query?.rawAst) {
                    res.status(200).send(fullResponse.body);
                } else {
                    const parser = new OpaCompileResponseParser();
                    parser.parse(fullResponse.body);
                    if (req?.query?.humanReadable) {
                        res.status(200).send(
                            parser.evaluateAsHumanReadableString()
                        );
                    } else {
                        res.status(200).send(parser.evaluate());
                    }
                }
            } else {
                res.status(fullResponse.statusCode).send(fullResponse.body);
            }
        } catch (e) {
            res.status(e.statusCode || 500).send(
                // request promise core add extra status code to error.message
                // https://github.com/request/promise-core/blob/091bac074e6c94850b999f0f824494d8b06faa1c/lib/errors.js#L26
                // Thus, we will try to use e.error if available
                e?.error ? e.error : e?.message ? e.message : String(e)
            );
        }
    }

    router.get("/decision*", getAuthDecision);
    router.post("/decision*", getAuthDecision);

    opaRoutes.map((route) => {
        if (route.method == "post") {
            router.post(route.path, proxyRequest);
        } else {
            router.get(route.path, proxyRequest);
        }
    });

    return router;
}
