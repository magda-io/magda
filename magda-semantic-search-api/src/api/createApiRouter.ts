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

    router.post(
        "/retrieve",
        validate({ body: retrieveSchema }, { context: true }, {}),
        handleRetrieve
    );

    router.get(
        "/search",
        validate({ query: searchSchema }, { context: true }, {}),
        handleSearch
    );
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
            if (err instanceof BadRequestError) {
                return res.status(err.statusCode).json(err.errorResponse);
            }

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
