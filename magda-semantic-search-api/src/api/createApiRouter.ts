import { Router, Request, Response, NextFunction } from "express";
import { SemanticSearchService } from "../service/SemanticSearchService.js";
import type { SearchParams, RetrieveParams } from "../model.js";
import { validate, Joi, ValidationError } from "express-validation";
import { BadRequestError } from "@magda/typescript-common/dist/createServiceError.js";

export interface ApiRouterOptions {
    jwtSecret: string;
}

const MAX_NUM_LIMIT = 500;

export function createRoutes(
    semanticSearchService: SemanticSearchService,
    _options: ApiRouterOptions
) {
    const router = Router();

    router.use((req: Request, _res: Response, next: NextFunction) => {
        const start = Date.now();
        console.info(
            `[${req.method}] ${req.originalUrl} - queryBody:`,
            req.method === "GET" ? req.query : req.body
        );
        _res.on("finish", () => {
            console.info(
                `[${req.method}] ${req.originalUrl} completed with status ${
                    _res.statusCode
                } in ${Date.now() - start}ms`
            );
        });
        next();
    });

    const searchSchema = Joi.object({
        query: Joi.string().min(1).required(),
        max_num_results: Joi.number()
            .integer()
            .min(1)
            .max(MAX_NUM_LIMIT)
            .default(100),

        itemType: Joi.string().valid("storageObject", "registryRecord"),
        fileFormat: Joi.string(),
        recordId: Joi.string(),
        subObjectId: Joi.string(),
        subObjectType: Joi.string(),
        minScore: Joi.number().min(0).max(1)
    });

    function parseTenantIdHeader(raw: string | undefined): number {
        if (raw === undefined || raw.trim() === "") {
            return 0;
        }

        const parsed = Number(raw);

        if (!Number.isInteger(parsed) || parsed < 0) {
            throw new BadRequestError(
                400,
                {
                    message: "Invalid X-Magda-Tenant-Id"
                },
                undefined
            );
        }

        return parsed;
    }

    async function handleSearch(
        req: Request,
        res: Response,
        next: NextFunction
    ) {
        try {
            const rawParams = ((req.method === "GET"
                ? req.query
                : req.body) as unknown) as SearchParams;
            const jwt = req.header("X-Magda-Session");
            const tenantId = req.header("X-Magda-Tenant-Id");
            const params: SearchParams = {
                ...(rawParams as SearchParams),
                jwt: jwt || undefined,
                tenantId: parseTenantIdHeader(tenantId)
            };
            const results = await semanticSearchService.search(params);
            res.status(200).json(results);
        } catch (err) {
            next(err);
        }
    }

    const retrieveSchema = Joi.object({
        ids: Joi.array().items(Joi.string()).required(),
        mode: Joi.string().valid("full", "partial").default("full"),
        precedingChunksNum: Joi.number().integer().min(0).default(0),
        subsequentChunksNum: Joi.number().integer().min(0).default(0)
    });

    async function handleRetrieve(
        req: Request,
        res: Response,
        next: NextFunction
    ) {
        try {
            const rawParams = req.body as RetrieveParams;
            const jwt = req.header("X-Magda-Session");
            const tenantId = req.header("X-Magda-Tenant-Id");
            const params: RetrieveParams = {
                ...(rawParams as RetrieveParams),
                jwt: jwt || undefined,
                tenantId: parseTenantIdHeader(tenantId)
            };
            const results = await semanticSearchService.retrieve(params);
            res.status(200).json(results);
        } catch (err) {
            next(err);
        }
    }

    /**
     * @apiDefine SemanticSearchHeaders
     * @apiHeader {String} [X-Magda-Session] Magda internal session JWT identifying the current user. Without it, the request is treated as anonymous.
     * @apiHeader {Number} [X-Magda-Tenant-Id=0] Tenant ID. Defaults to `0` when omitted.
     */

    /**
     * @apiDefine SemanticSearchError
     * @apiError (Error 400) {Object} error Request validation failed (a required parameter is missing or invalid).
     * @apiError (Error 500) {String} error A short error label, e.g. `Internal Server Error` or `OpenSearch index not found`.
     * @apiError (Error 500) {String} [message] A longer description — for a missing index, a hint to install a semantic indexer so the index is created.
     * @apiErrorExample {json} 500 (no index yet)
     *    {
     *      "error": "OpenSearch index not found",
     *      "message": "OpenSearch index not found: ... - Install at least one semantic indexer to create it automatically."
     *    }
     */

    /**
     * @apiGroup Semantic Search
     * @api {post} /v0/semantic-search/retrieve Retrieve chunks by ID
     * @apiName RetrieveSemanticChunks
     * @apiDescription Retrieves semantic-index chunks by their `id`s (typically
     *    those returned by `search`), optionally including neighbouring chunks for
     *    more context. Results are access-filtered for the current user.
     * @apiUse SemanticSearchHeaders
     *
     * @apiParam (body) {String[]} ids IDs of the index chunks to retrieve.
     * @apiParam (body) {String="full","partial"} [mode=full] `full` returns the whole item's text; `partial` returns the matched chunk plus any requested neighbours.
     * @apiParam (body) {Number{0-}} [precedingChunksNum=0] Number of chunks immediately before each result to include.
     * @apiParam (body) {Number{0-}} [subsequentChunksNum=0] Number of chunks immediately after each result to include.
     *
     * @apiSuccess {Object[]} result JSON array of retrieved items (fields below are on each element).
     * @apiSuccess {String} result.id Chunk ID.
     * @apiSuccess {String} result.itemType `storageObject` or `registryRecord`.
     * @apiSuccess {String} result.recordId The registry record the chunk was derived from.
     * @apiSuccess {String} result.parentRecordId The parent record (e.g. the dataset of a distribution).
     * @apiSuccess {String} result.fileFormat Source file format, when applicable.
     * @apiSuccess {String} result.subObjectId Identifier of a sub-object within the source, when applicable.
     * @apiSuccess {String} result.subObjectType Type of the sub-object, when applicable.
     * @apiSuccess {String} result.text The indexed text.
     * @apiUse SemanticSearchError
     */
    router.post(
        "/retrieve",
        validate({ body: retrieveSchema }, { context: true }, {}),
        handleRetrieve
    );

    /**
     * @apiGroup Semantic Search
     * @api {get} /v0/semantic-search/search Semantic search (GET)
     * @apiName GetSemanticSearch
     * @apiDescription Identical to `POST /v0/semantic-search/search`, but takes its
     *    parameters from the query string. Convenient for quick manual testing.
     * @apiUse SemanticSearchHeaders
     *
     * @apiParam (query) {String} query The natural-language query.
     * @apiParam (query) {Number{1-500}} [max_num_results=100] Maximum number of results to return.
     * @apiParam (query) {String="storageObject","registryRecord"} [itemType] Restrict results to one item type.
     * @apiParam (query) {String} [fileFormat] Restrict results to a source file format (e.g. `PDF`).
     * @apiParam (query) {String} [recordId] Restrict results to chunks derived from this registry record.
     * @apiParam (query) {String} [subObjectId] Restrict results to a sub-object within the source.
     * @apiParam (query) {String} [subObjectType] Restrict results to a sub-object type.
     * @apiParam (query) {Number{0-1}} [minScore] Drop results whose relevance score is below this threshold.
     *
     * @apiSuccess {Object[]} result JSON array of matching chunks (same shape as the POST endpoint).
     * @apiUse SemanticSearchError
     */
    router.get(
        "/search",
        validate({ query: searchSchema }, { context: true }, {}),
        handleSearch
    );
    /**
     * @apiGroup Semantic Search
     * @api {post} /v0/semantic-search/search Semantic search (POST)
     * @apiName PostSemanticSearch
     * @apiDescription Runs a natural-language semantic (vector) search over the
     *    semantic index and returns the most relevant chunks, each with a
     *    relevance score. This is the discovery step: to expand a hit into its
     *    full text or neighbouring chunks, pass the returned chunk `id`s to
     *    `POST /v0/semantic-search/retrieve`. Results are access-filtered for the
     *    current user. The searchable content is produced by semantic indexers —
     *    see [How to build a semantic indexer](https://github.com/magda-io/magda/blob/main/docs/docs/how-to-build-a-semantic-indexer.md).
     * @apiUse SemanticSearchHeaders
     *
     * @apiParam (body) {String} query The natural-language query.
     * @apiParam (body) {Number{1-500}} [max_num_results=100] Maximum number of results to return.
     * @apiParam (body) {String="storageObject","registryRecord"} [itemType] Restrict results to one item type.
     * @apiParam (body) {String} [fileFormat] Restrict results to a source file format (e.g. `PDF`).
     * @apiParam (body) {String} [recordId] Restrict results to chunks derived from this registry record.
     * @apiParam (body) {String} [subObjectId] Restrict results to a sub-object within the source.
     * @apiParam (body) {String} [subObjectType] Restrict results to a sub-object type.
     * @apiParam (body) {Number{0-1}} [minScore] Drop results whose relevance score is below this threshold.
     *
     * @apiSuccess {Object[]} result JSON array of matching chunks (fields below are on each element).
     * @apiSuccess {Number} result.score Relevance score (higher is more relevant).
     * @apiSuccess {String} result.id Chunk ID (pass to `/retrieve`).
     * @apiSuccess {String} result.itemType `storageObject` or `registryRecord`.
     * @apiSuccess {String} result.recordId The registry record the chunk was derived from.
     * @apiSuccess {String} result.parentRecordId The parent record (e.g. the dataset of a distribution).
     * @apiSuccess {String} result.fileFormat Source file format, when applicable.
     * @apiSuccess {String} result.subObjectId Identifier of a sub-object within the source, when applicable.
     * @apiSuccess {String} result.subObjectType Type of the sub-object, when applicable.
     * @apiSuccess {String} result.text The matched indexed text.
     * @apiSuccessExample {json} 200
     *    [
     *      {
     *        "score": 0.83,
     *        "id": "storageObject-ds-abc-dist-1-0",
     *        "itemType": "storageObject",
     *        "recordId": "dist-1",
     *        "parentRecordId": "ds-abc",
     *        "fileFormat": "PDF",
     *        "subObjectId": "",
     *        "subObjectType": "",
     *        "text": "..."
     *      }
     *    ]
     * @apiUse SemanticSearchError
     */
    router.post(
        "/search",
        validate({ body: searchSchema }, { context: true }, {}),
        handleSearch
    );

    router.use(
        (err: unknown, _req: Request, res: Response, next: NextFunction) => {
            if (err instanceof ValidationError) {
                res.status(err.statusCode).json(err);
            } else {
                next(err);
            }
        }
    );

    function isOpenSearchIndexNotFoundError(err: unknown): boolean {
        const error = err as any;

        return (
            error?.meta?.body?.error?.type === "index_not_found_exception" ||
            error?.body?.error?.type === "index_not_found_exception" ||
            error?.message?.includes("index_not_found_exception")
        );
    }

    function getOpenSearchErrorMessage(err: unknown): string {
        const error = err as any;

        return (
            error?.meta?.body?.error?.reason ||
            error?.body?.error?.reason ||
            error?.message ||
            "Unknown OpenSearch error"
        );
    }

    router.use(
        (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
            if (isOpenSearchIndexNotFoundError(err)) {
                const message =
                    `OpenSearch index not found: ${getOpenSearchErrorMessage(
                        err
                    )} ` +
                    "- Install at least one semantic indexer to create it automatically.";

                console.error("Unhandled error:", message);

                return res.status(500).json({
                    error: "OpenSearch index not found",
                    message
                });
            }

            console.error("Unhandled error:", (err as Error).message);
            return res.status(500).json({ error: "Internal Server Error" });
        }
    );

    return router;
}
