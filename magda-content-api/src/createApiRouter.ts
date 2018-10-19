import * as express from "express";
import { mustBeAdmin } from "@magda/typescript-common/dist/authorization-api/authMiddleware";
import buildJwt from "@magda/typescript-common/dist/session/buildJwt";
import GenericError from "@magda/typescript-common/dist/authorization-api/GenericError";
import Database from "./Database";
import { Maybe } from "tsmonad";
import { Content } from "./model";
import { content, ContentEncoding, ContentItem } from "./content";

export interface ApiRouterOptions {
    database: Database;
    jwtSecret: string;
    authApiUrl: string;
}

export default function createApiRouter(options: ApiRouterOptions) {
    const database = options.database;

    const router: express.Router = express.Router();

    const ADMIN = mustBeAdmin(options.authApiUrl, options.jwtSecret);

    router.get("/healthz", function(req, res, next) {
        res.status(200).send("OK");
    });

    /**
     * @apiGroup Content
     * @api {post} /v0/content/:contentId Get All
     * @apiDescription Get a list of content items and their type.
     * You must be an admin for this.
     *
     * @apiSuccess {string} result=SUCCESS
     *
     * @apiSuccessExample {json} 200
     *    [
     *        {
     *            "id": ...,
     *            "type": ...
     *        },
     *        ...
     *    ]
     */
    router.get("/all", ADMIN, async function(req, res) {
        res.json(await database.getContentSummary());
    });

    /**
     * @apiGroup Content
     * @api {get} /v0/content/:contentId.:format Get Content
     * @apiDescription Returns content by content id.
     *
     * @apiParam {string} contentId id of content item
     * @apiParam {string} format The format to return result with.
     * * If specified format is text, will return content as plain/text.
     * * If specified format is json, will return content as application/json.
     * * If specified format is anything else, will return content as saved mime type.
     *
     * @apiSuccessExample {any} 200
     *    Content in format requested
     *
     * @apiError {string} result=FAILED
     *
     * @apiErrorExample {json} 404
     *    {
     *         "result": "FAILED"
     *    }
     *
     * @apiErrorExample {json} 500
     *    {
     *         "result": "FAILED"
     *    }
     */
    router.get("/:contentId.:format", getContent);
    router.get("/*", getContent);

    async function getContent(req: any, res: any) {
        const requestContentId = req.params.contentId;
        const requestFormat = req.params.format;
        try {
            const contentPromise = await database.getContentById(
                requestContentId
            );
            const { content, format } = (await contentPromise.caseOf({
                just: content =>
                    Promise.resolve(
                        Maybe.just({
                            format: requestFormat,
                            content
                        })
                    ),
                nothing: async () => {
                    const tempContentId = req.path.substr(1);
                    const tempContentMaybe = await database.getContentById(
                        tempContentId
                    );

                    return tempContentMaybe.map(content => ({
                        format: tempContentId.substr(
                            tempContentId.lastIndexOf(".") + 1
                        ),
                        content
                    }));
                }
            })).valueOrThrow(
                new GenericError(
                    `Unsupported configuration item requested: ${requestContentId}.${requestFormat}`,
                    404
                )
            );

            switch (format) {
                case "json":
                    JSON.parse(content.content);
                    return returnText(res, content, "application/json");
                case "js":
                    return returnText(res, content, "application/javascript");
                case "text":
                    return returnText(res, content, "text/plain");
                case "md":
                    return returnText(res, content, "text/plain");
                case "css":
                case "html":
                    return returnText(res, content, `text/${format}`);
                default:
                    return returnBinary(res, content);
            }
        } catch (e) {
            res.status(e.statusCode || 500).json({
                result: "FAILED"
            });
            console.error(e);
        }
    }

    Object.entries(content).forEach(function(config: [string, ContentItem]) {
        const [contentId, configurationItem] = config;

        const body = configurationItem.body || null;

        /**
         * @apiGroup Content
         * @api {post} /v0/content/:contentId Update Content
         * @apiDescription Update content by id
         *
         * @apiParam {string} contentId id of content item
         * @apiHeader {string} Content-Type=text/plain mime type of posted content.
         *
         * @apiSuccess {string} result=SUCCESS
         *
         * @apiSuccessExample {json} 200
         *    {
         *         "result": "SUCCESS"
         *    }
         *
         * @apiError {string} result=FAILED
         *
         * @apiErrorExample {json} 400
         *    {
         *         "result": "FAILED"
         *    }
         */

        const route = configurationItem.route || `/${contentId}`;

        router.post(route, ADMIN, body, async function(req, res) {
            try {
                let content = req.body;

                switch (configurationItem.encode) {
                    case ContentEncoding.base64:
                        if (!(content instanceof Buffer)) {
                            throw new GenericError(
                                "Can not base64 encode non-raw"
                            );
                        }
                        content = content.toString("base64");
                        break;
                }

                if (typeof content !== "string") {
                    // if this error is being thrown, also check if body parser is configured with right type
                    throw new GenericError(
                        `Config value is not string yet (${typeof content}). You'll got some work to do.`
                    );
                }

                const contentType =
                    configurationItem.contentType ||
                    req.headers["content-type"] ||
                    "text/plain";

                const finalContentId = req.path.substr(1);

                await database.setContentById(
                    finalContentId,
                    contentType,
                    content
                );

                res.status(201).json({
                    result: "SUCCESS"
                });
            } catch (e) {
                res.status(e.statusCode || 500).json({
                    result: "FAILED"
                });
                console.error(e);
            }
        });

        /**
         * @apiGroup Content
         * @api {delete} /v0/content/:contentId Delete Content
         * @apiDescription Delete content by content id. Must be an admin.
         * Only available for contents with wildcard ids.
         *
         * @apiParam {string} contentId id of content item
         *
         * @apiSuccessExample {any} 204
         *    {
         *         "result": "SUCCESS"
         *    }
         *
         */
        if (configurationItem.route) {
            router.delete(route, ADMIN, body, async function(req, res) {
                const finalContentId = req.path.substr(1);

                await database.deleteContentById(finalContentId);

                res.status(204).json({
                    result: "SUCCESS"
                });
            });
        }
    });

    // This is for getting a JWT in development so you can do fake authenticated requests to a local server.
    if (process.env.NODE_ENV !== "production") {
        router.get("/public/jwt", function(req, res) {
            res.status(200);
            res.write(
                "X-Magda-Session: " +
                    buildJwt(
                        options.jwtSecret,
                        "00000000-0000-4000-8000-000000000000"
                    )
            );
            res.send();
        });
    }

    return router;
}

function returnBinary(res: any, content: Content) {
    const buffer = Buffer.from(content.content, "base64");
    res.header("Content-Type", content.type).send(buffer);
}

function returnText(res: any, content: Content, mime: string) {
    res.header("Content-Type", mime).send(content.content);
}
