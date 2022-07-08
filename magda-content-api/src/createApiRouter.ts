import express, { Response } from "express";
import _ from "lodash";
import {
    getUser,
    mustBeAdmin
} from "magda-typescript-common/src/authorization-api/authMiddleware";
import buildJwt from "magda-typescript-common/src/session/buildJwt";
import GenericError from "magda-typescript-common/src/authorization-api/GenericError";
import ServerError from "magda-typescript-common/src/ServerError";
import Database, { Query } from "./Database";
import { Maybe } from "tsmonad";
import { Content } from "./model";
import {
    content,
    ContentEncoding,
    ContentItem,
    findContentItemById
} from "./content";

import {
    installStatusRouter,
    createServiceProbe
} from "magda-typescript-common/src/express/status";
import AccessControlError from "magda-typescript-common/src/authorization-api/AccessControlError";
import { User } from "magda-typescript-common/src/authorization-api/model";
import mime from "mime-types";

export interface ApiRouterOptions {
    database: Database;
    jwtSecret: string;
    authApiUrl: string;
}

export default function createApiRouter(options: ApiRouterOptions) {
    const database = options.database;

    const router: express.Router = express.Router();

    const status = {
        probes: {
            database: database.check.bind(database),
            auth: createServiceProbe(options.authApiUrl)
        }
    };
    installStatusRouter(router, status);

    const USER = getUser(options.authApiUrl, options.jwtSecret);
    const ADMIN = mustBeAdmin(options.authApiUrl, options.jwtSecret);

    /**
     * @apiGroup Content
     * @api {post} /v0/content/all Get All
     * @apiDescription Get a list of content items and their type.
     *
     * @apiParam (Query) {string} id filter content id by this wildcard pattern. For example: "id=header/*&id=footer/*". Can specify multiple.
     * @apiParam (Query) {string} type filter content mime type by this wildcard pattern. For example: "type=application/*". Can specify multiple.
     * @apiParam (Query) {boolean} inline flag to specify if content should be inlined. Only application/json mime type content is supported now.
     *
     * @apiSuccess {string} result=SUCCESS
     *
     * @apiSuccessExample {json} 200
     *    [
     *        {
     *            "id": ...
     *            "type": ...
     *            "length": ...
     *            "content": ...
     *        },
     *        ...
     *    ]
     */
    router.get("/all", USER, async function (req, res) {
        try {
            const idQuery: Query = {
                field: "id",
                patterns: coerceToArray(req.query.id as string)
            };
            const typeQuery: Query = {
                field: "type",
                patterns: coerceToArray(req.query.type as string)
            };

            const inline =
                req.query.inline &&
                (req.query.inline as string).toLowerCase() === "true";
            const inlineContentIfType: string[] = inline
                ? ["application/json", "text/plain"]
                : [];

            // get summary
            let all: any[] = await database.getContentSummary(
                [idQuery, typeQuery],
                inlineContentIfType,
                req.header("X-Magda-Session")
            );

            // filter out privates and non-configurable
            all = all.filter((item: any) => {
                const contentItem = findContentItemById(item.id);

                if (contentItem && contentItem.private) {
                    return (req.user as User)?.isAdmin;
                } else {
                    return true;
                }
            });

            // inline
            if (inline) {
                for (const item of all.filter((item) => item.content)) {
                    try {
                        switch (item.type) {
                            case "application/json":
                                item.content = JSON.parse(item.content);
                                break;
                        }
                    } catch (e) {
                        item.error = e.message;
                        console.error(e.stack);
                    }
                }
            }

            res.json(all);
        } catch (e) {
            console.error(e);
            res.sendStatus(500);
        }
    });

    function coerceToArray<T>(thing: T | T[]): T[] {
        if (_.isArray(thing)) {
            return thing;
        } else if (thing) {
            return [thing];
        } else {
            return [];
        }
    }

    /**
     * @apiGroup Content
     * @api {get} /v0/content/:contentId Get Content
     * @apiDescription Returns content by content id.
     *
     * @apiParam {string} contentId id of content item
     * You can opt to supply optional extension name for the content you request.
     * The extension name will be used to override the default output form of the content,
     * if a proper mime type can be located for the extension name.
     * e.g. suppose we have a content id: `header/logo`
     * If we request `{get} /v0/content/header/logo` (without extension), the api will respond in binary as it's an image.
     * If we request `{get} /v0/content/header/logo.txt`, the api will respond in based64 text.
     *
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
    router.get("/*", getContent);

    async function getContent(req: any, res: any) {
        try {
            if (!req?.path?.length || req.path.length < 2) {
                throw new ServerError("empty content id is supplied", 400);
            }
            const extNameIdx = req?.path?.lastIndexOf(".");
            const contentIdWithNoExt =
                extNameIdx >= 0
                    ? req.path.substring(1, extNameIdx)
                    : req.path.substring(1);
            const requestFormat =
                extNameIdx >= 0 ? req.path.substring(extNameIdx) : "";

            if (!contentIdWithNoExt) {
                throw new ServerError(
                    `empty content id is supplied in request path: ${req.path}`,
                    400
                );
            }

            const contentMaybe = await database.getContentById(
                contentIdWithNoExt,
                req.header("X-Magda-Session")
            );
            const { content, format } = (
                await contentMaybe.caseOf({
                    just: (content) =>
                        Promise.resolve(
                            Maybe.just({
                                format: requestFormat,
                                content
                            })
                        ),
                    nothing: async () => {
                        const fullContentId = req.path.substring(1);
                        if (!fullContentId) {
                            throw new ServerError(
                                `empty content id is supplied in request path: ${req.path}`,
                                400
                            );
                        }
                        const tempContentMaybe = await database.getContentById(
                            fullContentId,
                            req.header("X-Magda-Session")
                        );

                        return tempContentMaybe.map((content) => ({
                            format: requestFormat,
                            content
                        }));
                    }
                })
            ).valueOrThrow(
                new GenericError(
                    `Unsupported configuration item requested: ${req?.path}.$p{requestFormat}`,
                    404
                )
            );

            outputContent(res, content, format);
        } catch (e) {
            res.status(e?.statusCode || 500).json({
                result: "FAILED",
                message: e?.message ? e.message : ""
            });
            if (e instanceof AccessControlError) {
                console.log(e);
            } else {
                console.error(e);
            }
        }
    }

    Object.entries(content).forEach(function (config: [string, ContentItem]) {
        const [contentId, configurationItem] = config;

        const route = configurationItem.route || `/${contentId}`;
        const body = configurationItem.body || null;
        const verify = configurationItem.verify || null;

        /**
         * @apiGroup Content
         * @api {put} /v0/content/:contentId Update Content
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

        async function put(req: any, res: any) {
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
                    case ContentEncoding.json:
                        if (
                            typeof content !== "object" &&
                            typeof content !== "string" &&
                            typeof content !== "number" &&
                            typeof content !== "boolean" &&
                            content !== null
                        ) {
                            throw new GenericError(
                                "Can not stringify encode non-json"
                            );
                        }
                        content = JSON.stringify(content);
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
        }

        router.put.apply(
            router,
            ([route, ADMIN, body, verify, put] as any).filter((i: any) => i)
        );

        /**
         * @apiGroup Content
         * @api {delete} /v0/content/:contentId Delete Content
         * @apiDescription Delete content by content id. Must be an admin.
         * Only available for contents with wildcard ids.
         *
         * @apiParam {string} contentId id of content item
         *
         * @apiSuccessExample {any} 200
         *    {
         *         "result": "SUCCESS"
         *    }
         *
         */

        router.delete(route, ADMIN, async function (req, res) {
            const finalContentId = req.path.substr(1);

            await database.deleteContentById(finalContentId);

            res.status(200).json({
                result: "SUCCESS"
            });
        });
    });

    // This is for getting a JWT in development so you can do fake authenticated requests to a local server.
    if (process.env.NODE_ENV !== "production") {
        router.get("/public/jwt", function (req, res) {
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

function outputContent(
    res: Response,
    content: Content,
    requestFormat?: string
) {
    const lookupResult = mime.lookup(requestFormat ? requestFormat : "");
    const type: string = lookupResult ? lookupResult : content.type;

    let data: Buffer | string;
    if (type.startsWith("image/") || type === "application/octet-stream") {
        data = Buffer.from(content.content, "base64");
    } else {
        data = content.content;
    }

    res.header("Content-Type", type).send(data);
}
