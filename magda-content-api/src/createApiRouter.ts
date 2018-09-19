import * as express from "express";
import { mustBeAdmin } from "@magda/typescript-common/dist/authorization-api/authMiddleware";
import Database from "./Database";
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

    router.get("/healthz", function(req, res, next) {
        res.status(200).send("OK");
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
                    `Unsupported configuration item requested: ${format}`
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

    const ADMIN = mustBeAdmin(options.authApiUrl, options.jwtSecret);

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

    router.get("/all", ADMIN, async function(req, res) {
        res.json(await database.getContentSummary());
    });

    // This is for getting a JWT in development so you can do fake authenticated requests to a local server.
    if (process.env.NODE_ENV !== "production") {
        router.get("public/jwt", function(req, res) {
            res.status(200);
            res.write("X-Magda-Session: " + req.header("X-Magda-Session"));
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
