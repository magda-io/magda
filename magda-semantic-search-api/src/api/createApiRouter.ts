import { Router, Request, Response, NextFunction } from "express";
import { SemanticSearchService } from "../service/SemanticSearchService.js";
import type { SearchParams, RetrieveParams } from "../model.js";
import { validate, Joi, ValidationError } from "express-validation";

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

    async function handleSearch(
        req: Request,
        res: Response,
        next: NextFunction
    ) {
        try {
            const params = ((req.method === "GET"
                ? req.query
                : req.body) as unknown) as SearchParams;
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
            const params = req.body as RetrieveParams;
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

    router.use(
        (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
            console.error("Unhandled error:", (err as Error).message);
            res.status(500).json({ error: "Internal Server Error" });
        }
    );

    return router;
}
