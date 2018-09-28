import * as express from "express";
import { mustBeAdmin } from "@magda/typescript-common/dist/authorization-api/authMiddleware";
import buildJwt from "@magda/typescript-common/dist/session/buildJwt";
import GenericError from "@magda/typescript-common/dist/authorization-api/GenericError";
import Database from "./Database";
import * as mime from "mime-types";
import * as URI from "urijs";
import * as path from "path";
import * as bodyParser from "body-parser";
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

    function parseUrlPath(pathString: string) {
        const pathItems = URI(pathString).segmentCoded();
        pathItems.shift(); //--- remove "commonAssets/"
        const contentId = pathItems.join("/");
        let format = path.extname(pathItems.pop());
        if (format[0] === ".") {
            format = format.substring(1);
        }
        return { contentId, format };
    }

    /**
     * We will want a common way to store object in content API without prior code changes
     * The default upload format will be `x-www-form-urlencoded`.
     * Default mime type is: `application/octet-stream`
     * The actually response mime type should be determined by resource ext name
     */

    /**
     * @apiGroup Content
     * @api {get} /v0/content/commonAssets/:contentId Get Common Content Assets
     * @apiDescription Returns content by content id. Its mime type will be determined by ext name (i.e. format)
     *
     * @apiParam {string} contentId id of content item. e.g. a/b/c.png
     * * will be determined by mime lookup using ext name of the contentId.
     *
     * @apiSuccessExample {any} 200
     *    Content in format requested
     *
     * @apiError {string} result=FAILED
     *
     * @apiErrorExample {json} 404
     *    {
     *         "result": "FAILED",
     *         "ErrorMessage": "xxxxx"
     *    }
     *
     * @apiErrorExample {json} 500
     *    {
     *         "result": "FAILED",
     *         "ErrorMessage": "xxxxx"
     *    }
     */
    router.get("/commonAssets/*", async function(req, res) {
        const { contentId, format } = parseUrlPath(req.path);
        try {
            const content = (await database.getContentById(
                contentId
            )).valueOrThrow(
                new GenericError(`Cannot locate ${contentId}`, 404)
            );
            const mimeType = mime.lookup(format);
            const buffer = Buffer.from(content.content, "base64");
            res.header(
                "Content-Type",
                mimeType === false ? "application/octet-stream" : mimeType
            ).send(buffer);
        } catch (e) {
            const statusCode = e.statusCode ? e.statusCode : 500;
            res.status(statusCode).json({
                result: "FAILED",
                ErrorMessage: e.toString()
            });
            if (statusCode !== 404) {
                console.error(e);
            }
        }
    });

    /**
     * @apiGroup Content
     * @api {post} /v0/content/commonAssets/:contentId Update Generic Non predefined Content
     * @apiDescription Update Generic Non predefined content by id.
     *
     * @apiParam {string} contentId id of content item
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
    router.post(
        `/commonAssets/*`,
        ADMIN,
        bodyParser.raw({
            type: "*/*",
            inflate: true,
            limit: "32mb"
        }),
        async function(req, res) {
            try {
                const { contentId, format } = parseUrlPath(req.path);
                let mimeType = mime.lookup(format);
                if (mimeType === false) {
                    mimeType = "application/octet-stream";
                }

                let content = req.body;
                if (!(content instanceof Buffer)) {
                    throw new Error("Failed to process request body.");
                }
                content = content.toString("base64");

                await database.setContentById(contentId, mimeType, content);

                res.status(201).json({
                    result: "SUCCESS"
                });
            } catch (e) {
                res.status(500).json({
                    result: "FAILED"
                });
                console.error(e);
            }
        }
    );

    /**
     * @apiGroup Content
     * @api {get} /v0/content/:contentId.:format Get Content
     * @apiDescription Returns content by content id.
     *
     * @apiParam {string} contentId id of content item
     * @apiParam {string} format The format to return result with.
     * * If specified format is text, will return content as plain/text.
     * * If specified format is json, will return content as application/json.
     * * If specified format is bin, will return content as saved mime type.
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
    router.get("/:contentId.:format", async function(req, res) {
        const contentId = req.params.contentId;
        const format = req.params.format;
        try {
            const maybeContent = await database.getContentById(contentId);
            const content = maybeContent.caseOf({
                nothing: () => null,
                just: x => x
            });

            if (content === null) {
                throw new Error(
                    `Unsupported configuration item requested: ${contentId}.${format}`
                );
            }

            switch (format) {
                case "bin":
                    return returnBinary(res, content);
                case "json":
                    return returnJSON(res, content);
                case "text":
                    return returnText(res, content);
                case "css":
                    return returnCss(res, content);
                default:
                    throw new Error(`Unsupported format requested: ${format}`);
            }
        } catch (e) {
            res.status(e.message.match(/^unsupported/i) ? 404 : 500).json({
                result: "FAILED"
            });
            console.error(e);
        }
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
                            throw new Error("Can not base64 encode non-raw");
                        }
                        content = content.toString("base64");
                        break;
                }

                if (typeof content !== "string") {
                    throw new Error(
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
                res.status(e.message.match(/^unsupported/i) ? 404 : 500).json({
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

function returnJSON(res: any, content: Content) {
    JSON.parse(content.content);
    res.header("Content-Type", "application/json").send(content.content);
}

function returnText(res: any, content: Content) {
    res.header("Content-Type", "text/plain").send(content.content);
}

function returnCss(res: any, content: Content) {
    res.header("Content-Type", "text/css").send(content.content);
}
