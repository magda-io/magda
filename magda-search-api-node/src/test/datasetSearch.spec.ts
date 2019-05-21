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
    let app: express.Application;
    const regions: Region[] = [buildRegion()];

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
                console.log(
                    `/datasets?query=${randomCase(acronymWithDataset.acronym)}`
                );

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

    it("for a region in query text should boost results from that region", async () => {
        await buildRegionsIndex(client, API_ROUTER_CONFIG.regionsIndexId, [
            buildRegion({
                north: -10,
                east: 156,
                south: -29,
                west: 138
            })
        ]);

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
            publishingState: "published"
        });

        const nationalDataset1 = buildDataset({
            identifier: "ds-region-in-query-test-2",
            title: "Wildlife density in rural areas",
            description:
                "Wildlife density aggregated from states' measures of wildlife density.",
            catalog: "region-in-query-test-catalog",
            quality: 0.6,
            publishingState: "published"
        });

        const nationalDataset2 = buildDataset({
            identifier: "ds-region-in-query-test-3",
            title: "Wildlife density in rural areas",
            description:
                "Wildlife density aggregated from states' measures of wildlife density in queensland.",
            catalog: "region-in-query-test-catalog",
            quality: 0.6,
            publishingState: "published"
        });

        await buildDatasetIndex(client, API_ROUTER_CONFIG.datasetsIndexId, [
            qldDataset,
            nationalDataset1,
            nationalDataset2
        ]);

        await supertest(app)
            .get(`/datasets?query=wildlife density"`)
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
            .get(`/datasets?query=wildlife density in queensland"`)
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
});

function fromBoundingBox([north, east, south, west]: number[]): Polygon {
    const northEast = [east, north];
    const northWest = [west, north];
    const southWest = [west, south];
    const southEast = [east, south];

    return {
        type: "Polygon",
        coordinates: [[northEast, northWest, southWest, southEast, northEast]],
        bbox: [north, east, south, west]
    };
}

function buildNDatasets(n: number, override: (n: number) => any = () => {}) {
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

let globalDatasetIdentifierCount = 0;
function buildDataset(overrides: any = {}): Dataset {
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

function genMatching<T>(gen: () => T, predicate: (t: T) => boolean): T {
    let counter = 0;

    while (counter < 100) {
        const value = gen();

        if (predicate(value)) {
            return value;
        }
    }

    throw new Error(
        `Could not generate a value meeting predicate ${predicate.toString()} within 100 tries`
    );
}

function fixLatLngGenerator(gen: () => string): () => number {
    return () => Number.parseFloat(gen());
}
const latitude = fixLatLngGenerator(() => casual.latitude);
const longitude = fixLatLngGenerator(() => casual.longitude);

function buildRegion(
    inputBoundingBox?: {
        north: number;
        west: number;
        south: number;
        east: number;
    },
    override?: any
): Region {
    const boundingBox = inputBoundingBox || {
        north: latitude(),
        west: longitude(),
        south: genMatching(latitude, genned => genned < boundingBox.north),
        east: genMatching(latitude, genned => genned < boundingBox.east)
    };

    return {
        regionId: casual.string,
        regionType: casual.string,
        regionSearchId: casual.string,
        regionName: casual.title,
        regionShortName: casual.name,
        boundingBox: {
            type: "envelope",
            coordinates: [
                [boundingBox.west, boundingBox.north],
                [boundingBox.east, boundingBox.south]
            ]
        },
        geometry: fromBoundingBox([
            boundingBox.north,
            boundingBox.east,
            boundingBox.south,
            boundingBox.west
        ]),
        ...override
    };
}
