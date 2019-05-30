import {} from "mocha";
import { expect } from "chai";
// import * as sinon from "sinon";
import supertest from "supertest";
import express from "express";
import { Client } from "@elastic/elasticsearch";
import _ from "lodash";
import casual from "casual";
import { Polygon } from "geojson";

import buildDatasetIndex from "./buildDatasetsIndex";
import buildRegionsIndex from "./buildRegionsIndex";
import createApiRouter from "../createApiRouter";
// import handleESError from "../search/handleESError";
import { Dataset, Region, SearchResult, Agent, Location } from "../model";

const client = new Client({ node: "http://localhost:9200" });
const API_ROUTER_CONFIG = {
    jwtSecret: "",
    datasetsIndexId: "datasets",
    regionsIndexId: "regions",
    publishersIndexId: "publishers"
};

describe("Searching for datasets", function(this: Mocha.ISuiteCallbackContext) {
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
            regionShortName: null,
            regionType: "ithinkthisisanotherregiontype"
        }
    ];

    const buildDataset = (() => {
        let globalDatasetIdentifierCount = 0;

        return function buildDataset(overrides: any = {}): Dataset {
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
        };
    })();

    before(async () => {
        const router = createApiRouter(API_ROUTER_CONFIG);
        app = express();
        app.use(router);

        await Promise.all([
            buildRegionsIndex(client, API_ROUTER_CONFIG.regionsIndexId, regions)
        ]);
    });

    beforeEach(() => {
        casual.seed(54321);
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
                buildDataset({
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

            const targetDataset1 = buildDataset({
                description: "Scrum is an agile methodology"
            });
            const targetDataset2 = buildDataset({
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

            await buildDatasetIndex(
                client,
                API_ROUTER_CONFIG.datasetsIndexId,
                datasets
            );

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

    describe("searching with regions", () => {
        const qldGeometry: Location = {
            geoJson: fromBoundingBox([-20, 147, -25, 139])
        };

        const qldDataset = buildDataset({
            identifier: "ds-region-in-query-test-1",
            title: "Wildlife density in rural areas",
            description: "Wildlife density as measured by the state survey",
            catalog: "region-in-query-test-catalog",
            spatial: qldGeometry,
            quality: 0.6,
            hasQuality: true,
            publishingState: "published"
        });

        const nationalDataset1 = buildDataset({
            identifier: "ds-region-in-query-test-2",
            title: "Wildlife density in rural areas",
            description:
                "Wildlife density aggregated from states' measures of wildlife density.",
            catalog: "region-in-query-test-catalog",
            quality: 0.6,
            hasQuality: true,
            publishingState: "published"
        });

        const nationalDataset2 = buildDataset({
            identifier: "ds-region-in-query-test-3",
            title: "Wildlife density in rural areas",
            description:
                "Wildlife density aggregated from states' measures of wildlife density in queensland.",
            catalog: "region-in-query-test-catalog",
            quality: 0.6,
            hasQuality: true,
            publishingState: "published"
        });

        async function setupQueensland() {
            await buildDatasetIndex(client, API_ROUTER_CONFIG.datasetsIndexId, [
                qldDataset,
                nationalDataset1,
                nationalDataset2
            ]);
        }

        it("should return datasets in the specified region", async () => {
            await setupQueensland();

            await supertest(app)
                .get(`/datasets?region=ithinkthisisregiontype:3`)
                .expect(200)
                .expect(res => {
                    const body: SearchResult = res.body;
                    const identifiers = body.datasets.map(
                        dataset => dataset.identifier
                    );

                    expect(identifiers).to.eql([qldDataset.identifier]);
                });
        });

        it("for a region in query text should boost results from that region", async () => {
            await setupQueensland();

            await supertest(app)
                .get(`/datasets?query=wildlife density`)
                .expect(200)
                .expect(res => {
                    const body: SearchResult = res.body;
                    const identifiers = body.datasets.map(
                        dataset => dataset.identifier
                    );

                    expect(identifiers).to.eql([
                        nationalDataset1.identifier,
                        nationalDataset2.identifier,
                        qldDataset.identifier
                    ]);
                });

            await supertest(app)
                .get(`/datasets?query=wildlife density in queensland`)
                .expect(200)
                .expect(res => {
                    const body: SearchResult = res.body;
                    const identifiers = body.datasets.map(
                        dataset => dataset.identifier
                    );

                    expect(identifiers).to.eql([
                        qldDataset.identifier,
                        nationalDataset2.identifier
                    ]);
                });
        });

        it("for a region _acronym_ in query text should boost results from that region", async () => {
            const saGeometry: Location = {
                geoJson: fromBoundingBox([-27, 134, -30, 130])
            };

            const saDataset = buildDataset({
                identifier: "ds-region-in-query-test-1",
                title: "Wildlife density in rural areas south",
                description: "Wildlife density as measured by the state survey",
                catalog: "region-in-query-test-catalog",
                spatial: saGeometry,
                quality: 0.6,
                hasQuality: true,
                publishingState: "published"
            });

            const nationalDataset1 = buildDataset({
                identifier: "ds-region-in-query-test-2",
                title: "Wildlife density in rural areas south",
                description:
                    "Wildlife density aggregated from states' measures of wildlife density.",
                catalog: "region-in-query-test-catalog",
                quality: 0.6,
                hasQuality: true,
                publishingState: "published"
            });

            const nationalDataset2 = buildDataset({
                identifier: "ds-region-in-query-test-3",
                title: "Wildlife density in rural areas south",
                description:
                    "Wildlife density aggregated from states' measures of wildlife density in SA.",
                catalog: "region-in-query-test-catalog",
                quality: 0.6,
                hasQuality: true,
                publishingState: "published"
            });

            await buildDatasetIndex(client, API_ROUTER_CONFIG.datasetsIndexId, [
                saDataset,
                nationalDataset1,
                nationalDataset2
            ]);

            await supertest(app)
                .get(`/datasets?query=wildlife density`)
                .expect(200)
                .expect(res => {
                    const body: SearchResult = res.body;
                    const identifiers = body.datasets.map(
                        dataset => dataset.identifier
                    );

                    expect(identifiers).to.eql([
                        nationalDataset1.identifier,
                        nationalDataset2.identifier,
                        saDataset.identifier
                    ]);
                });

            await supertest(app)
                .get(`/datasets?query=wildlife density in SA`)
                .expect(200)
                .expect(res => {
                    const body: SearchResult = res.body;
                    const identifiers = body.datasets.map(
                        dataset => dataset.identifier
                    );

                    expect(identifiers).to.eql([
                        saDataset.identifier,
                        nationalDataset2.identifier
                    ]);
                });

            await supertest(app)
                .get(`/datasets?query=wildlife density south`)
                .expect(200)
                .expect(res => {
                    const body: SearchResult = res.body;
                    const identifiers = body.datasets.map(
                        dataset => dataset.identifier
                    );

                    expect(identifiers).to.eql([
                        nationalDataset1.identifier,
                        nationalDataset2.identifier,
                        saDataset.identifier
                    ]);
                });
        });

        it("keywords matching a region should (within reason) outweigh keywords that match part of the description", async () => {
            // This has a dataset with the word "Alfredton" in the description, and a dataset without that keyword in the description
            // but a spatial extent that overlaps the region "Alfredton" - the region match should get priority.
            const alfredtonGeometry: Location = {
                geoJson: fromBoundingBox([-37.555, 143.81, -37.56, 143.8])
            };

            const alfDataset = buildDataset({
                identifier: "ds-region-in-query-test-1",
                title: "Wildlife density in rural areas",
                description: "Wildlife density as measured by the state survey",
                catalog: "region-in-query-test-catalog",
                spatial: alfredtonGeometry,
                quality: 0.6,
                hasQuality: true,
                publishingState: "published"
            });

            const nationalDataset1 = buildDataset({
                identifier: "ds-region-in-query-test-2",
                title: "Wildlife density in rural areas",
                description:
                    "Wildlife density aggregated from states' measures of wildlife density.",
                catalog: "region-in-query-test-catalog",
                quality: 0.6,
                hasQuality: true,
                publishingState: "published"
            });

            const nationalDataset2 = buildDataset({
                identifier: "ds-region-in-query-test-3",
                title: "Wildlife density in rural areas",
                description:
                    "Wildlife density aggregated from states' measures of wildlife density in Alfredton.",
                catalog: "region-in-query-test-catalog",
                quality: 0.6,
                hasQuality: true,
                publishingState: "published"
            });

            await buildDatasetIndex(client, API_ROUTER_CONFIG.datasetsIndexId, [
                alfDataset,
                nationalDataset1,
                nationalDataset2
            ]);

            await supertest(app)
                .get(`/datasets?query=wildlife density`)
                .expect(200)
                .expect(res => {
                    const body: SearchResult = res.body;
                    const identifiers = body.datasets.map(
                        dataset => dataset.identifier
                    );

                    expect(identifiers).to.eql([
                        nationalDataset1.identifier,
                        nationalDataset2.identifier,
                        alfDataset.identifier
                    ]);
                });

            await supertest(app)
                .get(`/datasets?query=wildlife density in Alfredton`)
                .expect(200)
                .expect(res => {
                    const body: SearchResult = res.body;
                    const identifiers = body.datasets.map(
                        dataset => dataset.identifier
                    );

                    expect(identifiers).to.eql([
                        alfDataset.identifier,
                        nationalDataset2.identifier
                    ]);
                });
        });
    });

    function fromBoundingBox([north, east, south, west]: number[]): Polygon {
        const northEast = [east, north];
        const northWest = [west, north];
        const southWest = [west, south];
        const southEast = [east, south];

        return {
            type: "Polygon",
            coordinates: [
                [northEast, northWest, southWest, southEast, northEast]
            ],
            bbox: [north, east, south, west]
        };
    }

    function buildNDatasets(
        n: number,
        override: (n: number) => any = () => {}
    ) {
        return _.range(0, n).map(() => buildDataset(override(n)));
    }

    function randomCase(string: string): string {
        return string
            .split("")
            .map(char =>
                casual.coin_flip ? char.toLowerCase() : char.toUpperCase()
            )
            .join("");
    }

    // function genMatching<T>(gen: () => T, predicate: (t: T) => boolean): T {
    //     let counter = 0;

    //     while (counter++ < 100) {
    //         const value = gen();

    //         if (predicate(value)) {
    //             return value;
    //         }
    //     }

    //     throw new Error(
    //         `Could not generate a value meeting predicate ${predicate.toString()} within 100 tries`
    //     );
    // }

    // function fixLatLngGenerator(gen: () => string): () => number {
    //     return () => Number.parseFloat(gen());
    // }
    // function latitude() {
    //     return fixLatLngGenerator(() => casual.latitude)();
    // }
    // function longitude() {
    //     return fixLatLngGenerator(() => casual.longitude)();
    // }

    // function buildRegion(
    //     inputBoundingBox?: {
    //         north: number;
    //         west: number;
    //         south: number;
    //         east: number;
    //     },
    //     override?: any
    // ): Region {
    //     const north = latitude();
    //     const west = longitude();
    //     const boundingBox = inputBoundingBox || {
    //         north,
    //         west,
    //         south: genMatching(latitude, genned => genned < north),
    //         east: genMatching(latitude, genned => genned < west)
    //     };

    //     return {
    //         regionId: casual.string,
    //         regionType: casual.string,
    //         regionSearchId: casual.string,
    //         regionName: casual.title,
    //         regionShortName: casual.name,
    //         boundingBox: {
    //             type: "envelope",
    //             coordinates: [
    //                 [boundingBox.west, boundingBox.north],
    //                 [boundingBox.east, boundingBox.south]
    //             ]
    //         },
    //         geometry: fromBoundingBox([
    //             boundingBox.north,
    //             boundingBox.east,
    //             boundingBox.south,
    //             boundingBox.west
    //         ]),
    //         ...override
    //     };
    // }
});
