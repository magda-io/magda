import * as express from "express";
import * as _ from "lodash";
import buildJwt from "@magda/typescript-common/dist/session/buildJwt";
const validate = require("express-validation");
import * as joi from "joi";

import ElasticSearchQueryer from "./search/ElasticSearchQueryer";
import { Query } from "./model";

const searchQueryer = new ElasticSearchQueryer("datasets41", "regions23");

// import {
//     installStatusRouter,
//     createServiceProbe
// } from "@magda/typescript-common/dist/express/status";

export interface ApiRouterOptions {
    jwtSecret: string;
}

export default function createApiRouter(options: ApiRouterOptions) {
    const router: express.Router = express.Router();

    // const status = {
    //     probes: {
    //         database: database.check.bind(database),
    //         auth: createServiceProbe(options.authApiUrl)
    //     }
    // };
    // installStatusRouter(router, status);

    const validation = {
        query: {
            facetQuery: joi.string().optional(),
            start: joi.number().default(0),
            limit: joi.number().default(10),
            generalQuery: joi.string().optional(),
            publisher: joi
                .array()
                .items(joi.string())
                .optional(),
            dateFrom: joi.date().optional(),
            dateTo: joi.date().optional(),
            region: joi
                .array()
                .items(joi.string())
                .optional(),
            format: joi
                .array()
                .items(joi.string())
                .optional(),
            publishingState: joi
                .array()
                .items(joi.string())
                .optional()
        }
    };

    // type Query = {
    //     facetQuery?: string;
    //     start: number;
    //     limit: number;
    //     generalQuery?: string;
    //     publisher?: string[];
    //     dateFrom?: Date;
    //     dateTo?: Date;
    //     region?: string[];
    //     format?: string[];
    //     publishingState?: string[];
    // };

    router.get(
        "/facets/:facetId/options",
        validate(validation),
        async (req, res) => {
            // const queryString = req.query;

            const processedQuery: Query = {
                publishers: [],
                regions: [],
                boostRegions: [],
                formats: [],
                publishingState: []
                // start: Number.parseInt(queryString.start),
                // limit: Number.parseInt(queryString.limit),
                // generalQuery: queryString.generalQuery,
                // publisher: queryString.publisher,
                // dateFrom: new Date(queryString)
            };

            try {
                const results = await searchQueryer.searchFacets(
                    "Publisher",
                    processedQuery,
                    0,
                    10,
                    "asic"
                );

                res.status(200).send(results);
            } catch (e) {
                console.error(e);
                console.log(JSON.stringify(e.meta.body));
                res.status(500).send("Error");
            }
        }
    );

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
