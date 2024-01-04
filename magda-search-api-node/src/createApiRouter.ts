import * as express from "express";
import * as _ from "lodash";
import buildJwt from "magda-typescript-common/src/session/buildJwt.js";
import moment from "moment";
import { validate, Joi, ValidationError } from "express-validation";

import ElasticSearchQueryer from "./search/elasticsearch/ElasticSearchQueryer.js";
import { Query, QueryRegion, FacetType } from "./model.js";

import { installStatusRouter } from "magda-typescript-common/src/express/status.js";

export interface ApiRouterOptions {
    jwtSecret: string;
    elasticSearchUrl: string;
    datasetsIndexId: string;
    regionsIndexId: string;
    publishersIndexId: string;
}

export default function createApiRouter(options: ApiRouterOptions) {
    const router: express.Router = express.Router();
    const searchQueryer = new ElasticSearchQueryer(
        options.elasticSearchUrl,
        options.datasetsIndexId,
        options.regionsIndexId,
        options.publishersIndexId
    );

    installStatusRouter(router);

    const baseValidators = {
        start: Joi.number().default(0),
        limit: Joi.number().default(10),
        publisher: Joi.array().items(Joi.string()).optional(),
        dateFrom: Joi.string().optional(),
        dateTo: Joi.string().optional(),
        region: Joi.alternatives([
            Joi.array().items(Joi.string()),
            Joi.string()
        ]).optional(),
        format: Joi.array().items(Joi.string()).optional(),
        publishingState: Joi.string().optional()
    };

    const facetQueryValidation = {
        query: Joi.object({
            facetQuery: Joi.string().optional(),
            generalQuery: Joi.string().optional(),
            ...baseValidators
        })
    };

    function processMaybeArray<T>(value: T | T[] | undefined): T[] | undefined {
        if (typeof value === "undefined" || _.isArray(value)) {
            return value;
        } else {
            return [value];
        }
    }

    function parseDate(dateString: string, forward: boolean = false) {
        if (!dateString || dateString.trim().length === 0) {
            return undefined;
        }

        const parsed = moment(dateString, [
            moment.ISO_8601,
            "YYYY-MM",
            "YYYY",
            "YY"
        ]);

        if (forward) {
            const creationData = parsed.creationData();

            if (
                creationData.format === "YYYY" ||
                creationData.format === "YY"
            ) {
                parsed.endOf("year");
            } else if (creationData.format === "YYYY-MM") {
                parsed.endOf("month");
            } else if (creationData.format === "YYYY-MM-DDTHH:mm") {
                parsed.endOf("minute");
            } else if (creationData.format === "YYYY-MM-DDTHH:mm:ss") {
                parsed.endOf("second");
            } else {
                parsed.endOf("day");
            }
        }

        return parsed.toDate();
    }

    function parseBaseQuery(queryStringObj: any): Query {
        return {
            freeText: queryStringObj.generalQuery,
            publishers: queryStringObj.publisher,
            dateFrom: parseDate(queryStringObj.dateFrom, false),
            dateTo: parseDate(queryStringObj.dateTo, true),
            regions: processRegions(processMaybeArray(queryStringObj.region)),
            formats: queryStringObj.format,
            publishingState: queryStringObj.publishingState
        };
    }

    router.get(
        "/facets/:facetId/options",
        validate(facetQueryValidation, {}, {}),
        async (req, res) => {
            const queryString = req.query;

            let processedQuery: Query;
            try {
                processedQuery = {
                    ...parseBaseQuery(queryString),
                    freeText: queryString.generalQuery as string
                };
            } catch (e) {
                console.debug(e);
                res.status(400).send("Error");
                return;
            }

            try {
                const results = await searchQueryer.searchFacets(
                    req.params.facetId as FacetType,
                    processedQuery,
                    queryString.start as any,
                    queryString.limit as any,
                    queryString.facetQuery as any
                );

                res.status(200).send(results);
            } catch (e) {
                console.error(e);
                res.status(500).send("Error");
            }
        }
    );

    const datasetQueryValidation = {
        query: Joi.object({
            ...baseValidators,

            query: Joi.string().optional(),
            facetSize: Joi.number().optional().default(10)
        })
    };

    router.get(
        "/datasets",
        //validate(datasetQueryValidation, {}, {}),
        async (req, res) => {
            const queryString = req.query;

            const processedQuery: Query = {
                ...parseBaseQuery(queryString),
                freeText: queryString.query as string
            };

            try {
                const results = await searchQueryer.search(
                    processedQuery,
                    queryString.start as any,
                    queryString.limit as any,
                    queryString.facetSize as any
                );

                res.status(200).send(results);
            } catch (e) {
                console.error(e);
                console.error((e as any).meta?.body?.error);
                // console.log(JSON.stringify(e.meta && e.meta.body));
                res.status(500).send("Error");
            }
        }
    );

    router.use(
        (
            err: any,
            _req: express.Request,
            res: express.Response,
            next: express.NextFunction
        ) => {
            if (err instanceof ValidationError) {
                return res.send(err.statusCode).json(err);
            }

            return next(err);
        }
    );

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

function processRegions(regions: string[] = []): QueryRegion[] {
    return regions.map((regionString) => {
        const [regionType, regionId] = regionString.split(":");
        return {
            regionType,
            regionId
        };
    });
}
