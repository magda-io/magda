import {} from "mocha";
import { expect } from "chai";
// import * as sinon from "sinon";
import supertest from "supertest";
import express from "express";
import { Client } from "@elastic/elasticsearch";
import _ from "lodash";
import casual from "casual";

import buildDatasetIndex from "./buildDatasetsIndex";
import buildRegionsIndex from "./buildRegionsIndex";
import createApiRouter from "../createApiRouter";
// import handleESError from "../search/handleESError";
import { Dataset, Region, SearchResult } from "../model";

const client = new Client({ node: "http://localhost:9200" });
const API_ROUTER_CONFIG = {
    jwtSecret: "",
    datasetsIndexId: "datasets",
    regionsIndexId: "regions",
    publishersIndexId: "publishers"
};

describe("Searching for datasets", function(this: Mocha.ISuiteCallbackContext) {
    let app: express.Application;
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
        const router = createApiRouter(API_ROUTER_CONFIG);
        app = express();
        app.use(router);
        await Promise.all([
            buildRegionsIndex(client, API_ROUTER_CONFIG.regionsIndexId, regions)
        ]);
    });

    beforeEach(() => {
        casual.seed(34234);
    });

    describe("by '*'", function() {
        it("should return all datasets when searching by *", async () => {
            const datasets = buildNDatasets(15);

            await buildDatasetIndex(
                client,
                API_ROUTER_CONFIG.datasetsIndexId,
                datasets
            );

            return supertest(app)
                .get(`/datasets?query=*&limit=${datasets.length}`)
                .expect(200)
                .expect(res => {
                    expect(res.body.hitCount).to.equal(datasets.length);
                });
        });

        it("hitCount should reflect all hits in the system, not just what is returned", async () => {
            const datasets = buildNDatasets(14);
            const halfMax = 7;

            await buildDatasetIndex(
                client,
                API_ROUTER_CONFIG.datasetsIndexId,
                datasets
            );

            return supertest(app)
                .get(`/datasets?query=*&limit=${halfMax}`)
                .expect(200)
                .expect(res => {
                    const body: SearchResult = res.body;
                    expect(body.hitCount).to.equal(datasets.length);
                    expect(body.datasets.length).to.equal(halfMax);
                });
        });

        it("should sort by quality", async () => {
            const datasets = _.range(0, 1, 0.1).map((quality: number) =>
                buildMinimalDataset({
                    quality,
                    hasQuality: true
                })
            );

            const reversed = _.reverse(datasets);

            await buildDatasetIndex(
                client,
                API_ROUTER_CONFIG.datasetsIndexId,
                reversed
            );

            return supertest(app)
                .get(`/datasets?query=*`)
                .expect(200)
                .expect(res => {
                    const body: SearchResult = res.body;
                    expect(
                        body.datasets.map(dataset => dataset.quality)
                    ).to.eql(datasets.map(dataset => dataset.quality));
                });
        });
    });

    describe("searching for a dataset should return that datasets contains the keyword & it's synonyms", async () => {
        it("for synonyms group 300032733 `agile`, `nimble`, `quick` & `spry`", async () => {
            const synonyms = ["agile", "nimble", "quick", "spry"];

            const targetDataset1 = buildMinimalDataset({
                description: "Scrum is an agile methodology"
            });
            const targetDataset2 = buildMinimalDataset({
                description: "The quick brown fox jumped over the lazy dog"
            });

            const datasets = [
                ...buildNDatasets(5),
                targetDataset1,
                ...buildNDatasets(5),
                targetDataset2,
                ...buildNDatasets(5)
            ];

            await buildDatasetIndex(
                client,
                API_ROUTER_CONFIG.datasetsIndexId,
                datasets
            );

            for (let synonym of synonyms) {
                await supertest(app)
                    .get(`/datasets?query=${synonym}`)
                    .expect(200)
                    .expect(res => {
                        const body: SearchResult = res.body;
                        const identifiers = body.datasets.map(
                            dataset => dataset.identifier
                        );

                        expect(identifiers).to.contain(
                            targetDataset1.identifier
                        );

                        expect(identifiers).to.contain(
                            targetDataset2.identifier
                        );
                    });
            }
        });
    });
});

function buildNDatasets(n: number, override: (n: number) => any = () => {}) {
    return _.range(0, n).map(() => buildMinimalDataset(override(n)));
}

let globalDatasetIdentifierCount = 0;
function buildMinimalDataset(overrides: any = {}): Dataset {
    return {
        identifier: "" + globalDatasetIdentifierCount++,
        catalog: "data.gov.au",
        publisher: {
            identifier: "publisher",
            name: casual.title
        },
        title: casual.title,
        description: casual.description,
        themes: casual.array_of_words(5),
        keywords: casual.array_of_words(5),
        distributions: [],
        quality: casual.double(0, 1),
        hasQuality: casual.coin_flip,
        ...overrides
    };
}
