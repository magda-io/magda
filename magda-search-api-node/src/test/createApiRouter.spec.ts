import {} from "mocha";
import { expect } from "chai";
// import * as sinon from "sinon";
import supertest from "supertest";
import express from "express";
import { Client } from "@elastic/elasticsearch";

import buildDatasetIndex from "./buildDatasetsIndex";
import buildRegionsIndex from "./buildRegionsIndex";
import createApiRouter from "../createApiRouter";
// import handleESError from "../search/handleESError";
import { Dataset, Region } from "../model";

const client = new Client({ node: "http://localhost:9200" });
const API_ROUTER_CONFIG = {
    jwtSecret: "",
    datasetsIndexId: "datasets",
    regionsIndexId: "regions",
    publishersIndexId: "publishers"
};

describe("createApiRouter", function(this: Mocha.ISuiteCallbackContext) {
    let app: express.Application;

    before(() => {
        const router = createApiRouter(API_ROUTER_CONFIG);
        app = express();
        app.use(router);
    });

    describe("Searching for a facet", function() {
        const datasets: Dataset[] = [
            {
                identifier: "1",
                catalog: "data.gov.au",
                publisher: {
                    identifier: "publisher",
                    name: "publisher"
                },
                title: "title",
                themes: [],
                keywords: [],
                distributions: [],
                quality: 1.0,
                hasQuality: true
            }
        ];

        const regions: Region[] = [
            {
                regionId: "blah",
                regionType: "blah",
                regionSearchId: "blah",
                regionName: "blah",
                boundingBox: {
                    north: 0,
                    south: 0,
                    east: 0,
                    west: 0
                },
                regionShortName: "b"
            }
        ];

        before(async () => {
            await Promise.all([
                buildDatasetIndex(
                    client,
                    API_ROUTER_CONFIG.datasetsIndexId,
                    datasets
                ),
                buildRegionsIndex(
                    client,
                    API_ROUTER_CONFIG.regionsIndexId,
                    regions
                )
            ]);
        });

        it("should return all datasets when searching by *", () => {
            return supertest(app)
                .get(`/datasets?query=*&limit=${datasets.length}`)
                .expect(200)
                .expect(res => {
                    expect(res.body.hitCount).to.equal(datasets.length);
                });
        });
    });
});
