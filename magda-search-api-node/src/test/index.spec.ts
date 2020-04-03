import {} from "mocha";
import { expect } from "chai";
// import * as sinon from "sinon";
import supertest from "supertest";
import express from "express";
import { Client } from "@elastic/elasticsearch";
import _ from "lodash";
import casual from "casual";

import createApiRouter from "../createApiRouter";
import {
    buildDatasetsIndex as buildDatasetsIndexInner,
    buildRegionsIndex as buildRegionsIndexInner,
    buildDataset,
    buildNDatasets
} from "./utils/builders";

// import handleESError from "../search/handleESError";
import { Dataset, Region, SearchResult, Agent } from "../model";

import testSearchNoQuery from "./testSearchNoQuery";
import testSearchByKeyword from "./testSearchByKeyword";
import testFilterByRegions from "./filtering/testFilterByRegion";
import testFilterByDate from "./filtering/testFilterByDate";

const ES_URL = process.env.TEST_ES_URL || "http://localhost:9200";
const client = new Client({
    node: ES_URL
});
const API_ROUTER_CONFIG = {
    jwtSecret: "",
    datasetsIndexId: "datasets",
    regionsIndexId: "regions",
    publishersIndexId: "publishers",
    elasticsearchUrl: ES_URL
};

describe("Search API:", function(this: Mocha.ISuiteCallbackContext) {
    this.timeout(60000);
    let app: express.Application;
    casual.seed(54321);
    const regions: Region[] = [
        {
            regionType: "ithinkthisisregiontype",
            regionName: "Queensland",
            regionId: "3",
            regionSearchId: "ithinkthisisregiontype/3",
            boundingBox: {
                type: "envelope",
                coordinates: [
                    [155.0830078125, -9.622414142924805],
                    [137.9443359375, -29.11377539511439]
                ]
            },
            regionShortName: "QLD",
            geometry: {
                type: "Polygon",
                coordinates: [
                    [
                        [142.4, -10.7],
                        [141.5, -13.6],
                        [141.6, -15.1],
                        [140.8, -17.5],
                        [139.9, -17.7],
                        [139, -17.3],
                        [137.9, -16.4],
                        [137.9, -26],
                        [140.9, -26],
                        [141, -29],
                        [148.9, -28.9],
                        [150, -28.6],
                        [150.8, -28.7],
                        [151.3, -29.1],
                        [151.9, -28.9],
                        [152, -28.6],
                        [152.5, -28.4],
                        [153.4, -28.2],
                        [152.9, -27.4],
                        [153, -26],
                        [152.4, -24.9],
                        [150.9, -23.6],
                        [150.5, -22.4],
                        [149.5, -22.3],
                        [149.1, -21],
                        [147.4, -19.5],
                        [146.2, -18.9],
                        [145.8, -17.3],
                        [145.2, -16.3],
                        [145.3, -15],
                        [144.4, -14.2],
                        [143.6, -14.3],
                        [143.4, -12.7],
                        [142.4, -10.7]
                    ]
                ]
            }
        },
        {
            boundingBox: {
                coordinates: [
                    [140.99853515625, -25.95804467331783],
                    [128.935546875, -40.128491056854074]
                ],
                type: "envelope"
            },
            geometry: {
                coordinates: [
                    [
                        [129.00146484375, -25.95804467331783],
                        [128.935546875, -33.74261277734688],
                        [140.99853515625, -40.128491056854074],
                        [140.9765625, -37.99616267972812],
                        [140.99853515625, -25.97779895546436],
                        [129.00146484375, -25.95804467331783]
                    ]
                ],
                type: "Polygon"
            },
            regionId: "4",
            regionName: "South Australia",
            regionSearchId: "ithinkthisisregiontype/4",
            regionShortName: "SA",
            regionType: "ithinkthisisregiontype"
        },
        {
            boundingBox: {
                coordinates: [
                    [143.818957568, -37.507245995],
                    [143.684946016, -37.570438887000016]
                ],
                type: "envelope"
            },
            geometry: {
                coordinates: [
                    [
                        [143.817818144, -37.561006440000035],
                        [143.815870752, -37.570438887000016],
                        [143.707238272, -37.5578780345],
                        [143.692926464, -37.558273952999976],
                        [143.685929152, -37.56013037250001],
                        [143.684946016, -37.55153592],
                        [143.69083488, -37.5219110745],
                        [143.69194512, -37.522036985500016],
                        [143.692966816, -37.51626095249998],
                        [143.70397299200002, -37.517608992000014],
                        [143.704768, -37.519353005500015],
                        [143.70626, -37.511441998500004],
                        [143.729532992, -37.51882799399999],
                        [143.74158192, -37.52394096850001],
                        [143.74465801600002, -37.507245995],
                        [143.80286499200002, -37.53370299300002],
                        [143.800909152, -37.53990286099999],
                        [143.812338016, -37.54136502699992],
                        [143.810268992, -37.543485996499996],
                        [143.809593088, -37.54661784300003],
                        [143.8145608, -37.547667588500026],
                        [143.813491584, -37.553411764500034],
                        [143.818957568, -37.55583173100005],
                        [143.817818144, -37.561006440000035]
                    ]
                ],
                type: "Polygon"
            },
            regionId: "201011001",
            regionName: "Alfredton",
            regionSearchId: "ithinkthisisanotherregiontype/201011001",
            regionShortName: undefined,
            regionType: "ithinkthisisanotherregiontype"
        }
    ];

    const buildDatasetIndex = (datasets: Dataset[]) =>
        buildDatasetsIndexInner(
            client,
            API_ROUTER_CONFIG.datasetsIndexId,
            datasets
        );

    const buildRegionsIndex = (regions: Region[]) =>
        buildRegionsIndexInner(
            client,
            API_ROUTER_CONFIG.regionsIndexId,
            regions
        );

    before(async () => {
        const router = createApiRouter(API_ROUTER_CONFIG);
        app = express();
        app.use(router);

        await Promise.all([buildRegionsIndex(regions)]);
    });

    beforeEach(() => {
        casual.seed(54321);
    });

    testSearchNoQuery(() => app, buildDatasetIndex);

    testSearchByKeyword(() => app, buildDatasetIndex);

    describe("filtering", () => {
        testFilterByDate(() => app, buildDatasetIndex);
        testFilterByRegions(() => app, buildDatasetIndex);
    });

    describe("searching for a dataset publisher's acronym should return that dataset eventually", () => {
        it.skip("for pre-defined pairs (won't work until we port the indexer to node js)", async () => {
            const pairs = [
                ["Australian Charities and Not-for-profits Commission", "ACNC"],
                ["Department of Foreign Affairs and Trade", "DFAT"],
                ["Department of Industry, Innovation and Science", "DIIS"]
            ];

            const acronymsWithDatasets = pairs.map(([name, acronym]) => ({
                acronym,
                dataset: buildDataset({
                    publisher: {
                        identifier: name,
                        title: randomCase(name)
                    } as Agent
                })
            }));

            const acronymDatasets = acronymsWithDatasets.map(
                ({ dataset }) => dataset
            );
            const otherDatasets = buildNDatasets(15);
            const datasets = _.shuffle([...acronymDatasets, ...otherDatasets]);

            await buildDatasetIndex(datasets);

            for (let acronymWithDataset of acronymsWithDatasets) {
                await supertest(app)
                    .get(
                        `/datasets?query=${randomCase(
                            acronymWithDataset.acronym
                        )}`
                    )
                    .expect(200)
                    .expect(res => {
                        const body: SearchResult = res.body;
                        const identifiers = body.datasets.map(
                            dataset => dataset.identifier
                        );

                        expect(identifiers).to.contain(
                            acronymWithDataset.dataset.identifier
                        );
                    });
            }
        });
    });

    function randomCase(string: string): string {
        return string
            .split("")
            .map(char =>
                casual.coin_flip ? char.toLowerCase() : char.toUpperCase()
            )
            .join("");
    }
});
