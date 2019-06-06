import {} from "mocha";
import { expect } from "chai";
// import * as sinon from "sinon";
import supertest from "supertest";
import express from "express";
import { Client } from "@elastic/elasticsearch";
import _ from "lodash";
import casual from "casual";
import { Polygon } from "geojson";

import buildDatasetIndexInner from "./buildDatasetsIndex";
import buildRegionsIndexInner from "./buildRegionsIndex";
import createApiRouter from "../createApiRouter";
// import handleESError from "../search/handleESError";
import {
    Dataset,
    Region,
    SearchResult,
    Agent,
    Location,
    Distribution,
    PeriodOfTime
} from "../model";
import moment = require("moment");

const client = new Client({
    node: process.env.TEST_ES_URL || "http://localhost:9200"
});
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

    const buildDatasetIndex = (datasets: Dataset[]) =>
        buildDatasetIndexInner(
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

    const buildDataset = (() => {
        let globalDatasetIdentifierCount = 0;

        return function buildDataset(overrides: any = {}): Dataset {
            return {
                identifier: "ds-" + globalDatasetIdentifierCount++,
                catalog: "data.gov.au",
                publisher: buildPublisher(),
                title: casual.title,
                description: casual.description,
                themes: casual.array_of_words(casual.integer(0, 10)),
                keywords: casual.array_of_words(casual.integer(0, 10)),
                distributions: buildNDistributions(casual.integer(0, 10)),
                quality: casual.double(0, 1),
                hasQuality: casual.coin_flip,
                temporal: {
                    start: casual.coin_flip
                        ? {
                              date: moment(
                                  casual.date("YYYY/MM/DD")
                              ).toISOString(),
                              text: casual.date("YYYY/MM/DD")
                          }
                        : undefined,
                    end: casual.coin_flip
                        ? {
                              date: moment(
                                  casual.date("YYYY/MM/DD")
                              ).toISOString(),
                              text: casual.date("YYYY/MM/DD")
                          }
                        : undefined
                } as PeriodOfTime,
                ...overrides
            } as Dataset;
        };
    })();

    const buildPublisher = (() => {
        let globalPublisherIdentifierCount = 0;

        return function buildPublisher(overrides: any = {}): Agent {
            return {
                identifier: "pub-" + globalPublisherIdentifierCount++,
                name: casual.title,
                description: casual.description,
                acronym: casual.title
                    .split(" ")
                    .map(word => word[0])
                    .join(""),
                jurisdiction: casual.title,
                aggKeywords: casual.array_of_words(casual.integer(0, 10)),
                email: casual.email,
                imageUrl: casual.url,
                phone: casual.phone,
                addrStreet: casual.street,
                addrSuburb: casual.city,
                addrPostcode: casual.coin_flip
                    ? casual.array_of_digits(4).join("")
                    : casual.zip,
                addrCountry: casual.country,
                website: casual.url,
                source: {
                    name: casual.title,
                    id: casual.string
                },

                ...overrides
            };
        };
    })();

    const buildDistribution = (() => {
        let globalDistIdentifierCount = 0;

        return function buildDataset(overrides: any = {}): Distribution {
            return {
                identifier: "dist-" + globalDistIdentifierCount++,
                title: casual.title,
                description: casual.description,
                issued: casual.date,
                modified: casual.date,
                license: {
                    name: casual.title,
                    url: casual.url
                },
                rights: casual.description,
                accessURL: casual.url,
                downloadURL: casual.url,
                byteSize: casual.integer(1, Number.MAX_SAFE_INTEGER),
                mediaType: casual.mime_type,
                source: {
                    id: casual.uuid,
                    name: casual.title
                },
                format: casual.mime_type.split("/")[1],

                ...overrides
            } as Distribution;
        };
    })();

    const buildN = <T>(builderFn: (override: any) => T) => (
        n: number,
        override: (n: number) => any = () => {}
    ): T[] => {
        return _.range(0, n).map(() => builderFn(override(n)));
    };

    const buildNDatasets = buildN(buildDataset);
    const buildNDistributions = buildN(buildDistribution);

    before(async () => {
        const router = createApiRouter(API_ROUTER_CONFIG);
        app = express();
        app.use(router);

        await Promise.all([buildRegionsIndex(regions)]);
    });

    beforeEach(() => {
        casual.seed(54321);
    });

    describe("by '*'", function() {
        it("should return all datasets when searching by *", async () => {
            const datasets = buildNDatasets(15);

            await buildDatasetIndex(datasets);

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

            await buildDatasetIndex(datasets);

            return supertest(app)
                .get(`/datasets?query=*&limit=${halfMax}`)
                .expect(200)
                .expect(res => {
                    const body: SearchResult = res.body;
                    expect(body.hitCount).to.equal(datasets.length);
                    expect(body.datasets.length).to.equal(halfMax);
                });
        });

        describe("should sort by quality", () => {
            const insertAndCheckOrder = async (datasets: Dataset[]) => {
                const reversed = _.reverse(datasets);
                const shuffled = _.shuffle(reversed);

                const toTry = [reversed, shuffled];

                for (let order of toTry) {
                    await buildDatasetIndex(order);

                    await supertest(app)
                        .get(`/datasets?query=*&limit=${order.length}`)
                        .expect(200)
                        .expect(res => {
                            const body: SearchResult = res.body;

                            expect(
                                body.datasets.map(dataset => [
                                    dataset.identifier,
                                    dataset.quality
                                ])
                            ).to.eql(
                                datasets.map(dataset => [
                                    dataset.identifier,
                                    dataset.quality
                                ])
                            );
                        });
                }
            };

            it("in general", async () => {
                const datasets = _.range(0, 1, 0.05).map((quality: number) =>
                    buildDataset({
                        quality,
                        hasQuality: true
                    })
                );

                await insertAndCheckOrder(datasets);
            });

            it("even when a dataset has 0 distributions", async () => {
                const datasets = _.range(0, 1, 0.05).map((quality: number) =>
                    buildDataset({
                        quality,
                        hasQuality: true
                    })
                );

                datasets[4].distributions = [];

                await insertAndCheckOrder(datasets);
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

            await buildDatasetIndex(datasets);

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
            await buildDatasetIndex([
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

            await buildDatasetIndex([
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

            await buildDatasetIndex([
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

    const testKeywordSearch = (termInData: string, termInQuery: string) => {
        const testField = async (override: any) => {
            const targetDataset = buildDataset(override);

            const datasets = _.shuffle([targetDataset, ...buildNDatasets(50)]);

            await buildDatasetIndex(datasets);

            await supertest(app)
                .get(`/datasets?query=${termInQuery}`)
                .expect(200)
                .expect(res => {
                    const body: SearchResult = res.body;

                    expect(body.hitCount).to.be.greaterThan(0);
                    expect(body.datasets[0].identifier).to.equal(
                        targetDataset.identifier
                    );
                });
        };

        describe(`'${termInQuery}' should be able to be found verbatim somewhere in a dataset for:`, () => {
            it("description", async () => {
                await testField({
                    description: `${casual.description} ${termInData} ${
                        casual.description
                    }`
                });
            });

            it("exact description", async () => {
                await testField({
                    description: termInData
                });
            });

            it("distribution description", async () => {
                await testField({
                    distributions: _.shuffle([
                        buildNDistributions(4),
                        buildDistribution({
                            description: `${casual.description} ${termInData} ${
                                casual.description
                            }`
                        })
                    ])
                });
            });

            it("exact distribution description", async () => {
                await testField({
                    distributions: _.shuffle([
                        buildNDistributions(4),
                        buildDistribution({
                            description: termInData
                        })
                    ])
                });
            });

            it("exact keyword", async () => {
                await testField({
                    keywords: _.shuffle([
                        ...casual.array_of_words(5),
                        termInData
                    ])
                });
            });

            it("theme", async () => {
                await testField({
                    themes: _.shuffle([
                        `${casual.short_description} ${termInData} ${
                            casual.short_description
                        }`,
                        ...casual.array_of_words(5)
                    ])
                });
            });

            it("exact theme", async () => {
                await testField({
                    themes: _.shuffle([...casual.array_of_words(5), termInData])
                });
            });

            describe.skip("(won't work until we fix #2238)", () => {
                it("title ", async () => {
                    await testField({
                        title: `${casual.title} ${termInData} ${casual.title}`
                    });
                });

                it("keyword", async () => {
                    await testField({
                        keywords: _.shuffle([
                            `${casual.short_description} ${termInData} ${
                                casual.short_description
                            }`,
                            ...casual.array_of_words(5)
                        ])
                    });
                });

                it("publisher name", async () => {
                    await testField({
                        publisher: buildPublisher({
                            name: `${casual.title} ${termInData} ${
                                casual.title
                            }`
                        })
                    });
                });

                it("publisher description", async () => {
                    await testField({
                        publisher: buildPublisher({
                            description: `${casual.description} ${termInData} ${
                                casual.description
                            }`
                        })
                    });
                });

                it("format", async () => {
                    await testField({
                        format: `${casual.short_description} ${termInData} ${
                            casual.short_description
                        }`
                    });
                });

                it("exact format", async () => {
                    await testField({
                        format: termInData
                    });
                });
            });
        });
    };

    describe("searching for keywords", () => {
        testKeywordSearch("rivers near ballarat", "rivers near ballarat");
    });

    describe("searching for quotes", () => {
        testKeywordSearch("rivers near ballarat", '"rivers near ballarat"');
    });

    describe("filtering", () => {
        describe("by date", () => {
            let datesByMonth: {
                datasets: Dataset[];
                earliest: moment.Moment;
                latest: moment.Moment;
            }[];

            describe("for datasets with a closed date range", async () => {
                before(async () => {
                    datesByMonth = _.range(0, 12).map(month => {
                        const monthMoment = moment()
                            .utc()
                            .year(2019)
                            .month(month);
                        const earliest = monthMoment.clone().startOf("month");
                        const latest = monthMoment.clone().endOf("month");

                        return {
                            datasets: _.range(1, 3).map(() => {
                                const start = moment
                                    .unix(
                                        casual.integer(
                                            earliest.unix(),
                                            latest
                                                .clone()
                                                .subtract(1, "days")
                                                .unix()
                                        )
                                    )
                                    .utc();
                                const end = moment
                                    .unix(
                                        casual.integer(
                                            start.unix(),
                                            latest.unix()
                                        )
                                    )
                                    .utc();

                                return buildDataset({
                                    temporal: {
                                        start: {
                                            date: start.toISOString(),
                                            text: start.toString()
                                        },
                                        end: {
                                            date: end.toISOString(),
                                            text: end.toString()
                                        }
                                    } as PeriodOfTime
                                });
                            }),
                            earliest,
                            latest
                        };
                    });

                    await buildDatasetIndex(
                        _.flatMap(datesByMonth, ({ datasets }) => datasets)
                    );
                });

                it("should only return results between dateTo and dateFrom if both are present", async () => {
                    for (let { datasets, earliest, latest } of datesByMonth) {
                        // console.log(
                        //     `/datasets?dateFrom=${earliest.format(
                        //         "YYYY/MM/DD"
                        //     )}&dateTo=${latest.format("YYYY/MM/DD")}`
                        // );
                        await supertest(app)
                            .get(
                                `/datasets?dateFrom=${earliest.format(
                                    "YYYY/MM/DD"
                                )}&dateTo=${latest.format("YYYY/MM/DD")}`
                            )
                            .expect(200)
                            .expect(res => {
                                const body: SearchResult = res.body;

                                const identifiers = body.datasets.map(
                                    dataset => dataset.identifier
                                );

                                expect(identifiers).to.have.same.members(
                                    datasets.map(ds => ds.identifier)
                                );
                            });
                    }
                });

                it("should only return results after dateFrom if dateTo is not also present", async () => {
                    for (let i = 0; i < datesByMonth.length; i++) {
                        const { earliest } = datesByMonth[i];

                        const expectedIdentifiers = _(datesByMonth)
                            .drop(i)
                            .flatMap(({ datasets }) => datasets)
                            .map(ds => ds.identifier)
                            .value();

                        await supertest(app)
                            .get(
                                `/datasets?dateFrom=${earliest.format(
                                    "YYYY/MM/DD"
                                )}&limit=${expectedIdentifiers.length + 1}`
                            )
                            .expect(200)
                            .expect(res => {
                                const body: SearchResult = res.body;

                                expect(
                                    body.datasets.map(ds => ds.identifier)
                                ).to.have.same.members(expectedIdentifiers);
                            });
                    }
                });

                it("should only return results before dateTo if dateFrom is not also present", async () => {
                    for (let i = 0; i < datesByMonth.length; i++) {
                        const { latest } = datesByMonth[i];

                        const expectedIdentifiers = _(datesByMonth)
                            .take(i + 1)
                            .flatMap(({ datasets }) => datasets)
                            .map(ds => ds.identifier)
                            .value();

                        await supertest(app)
                            .get(
                                `/datasets?dateTo=${latest.format(
                                    "YYYY/MM/DD"
                                )}&limit=${expectedIdentifiers.length + 1}`
                            )
                            .expect(200)
                            .expect(res => {
                                const body: SearchResult = res.body;

                                expect(
                                    body.datasets.map(ds => ds.identifier)
                                ).to.have.same.members(expectedIdentifiers);
                            });
                    }
                });
            });

            it("datasets should be retrievable by querying by their date", async () => {
                const datasets = buildNDatasets(100);
                await buildDatasetIndex(datasets);

                for (let dataset of datasets) {
                    if (
                        dataset.temporal &&
                        (dataset.temporal.end || dataset.temporal.start)
                    ) {
                        const url = `/datasets?${
                            dataset.temporal.end && dataset.temporal.end.date
                                ? "&dateTo=" +
                                  encodeURIComponent(
                                      moment(
                                          dataset.temporal.end.date
                                      ).toISOString()
                                  )
                                : ""
                        }${
                            dataset.temporal.start &&
                            dataset.temporal.start.date
                                ? "&dateFrom=" +
                                  encodeURIComponent(
                                      moment(
                                          dataset.temporal.start.date
                                      ).toISOString()
                                  )
                                : ""
                        }&limit=${datasets.length}`;

                        await supertest(app)
                            .get(url)
                            .expect(200)
                            .expect(res => {
                                const body: SearchResult = res.body;

                                expect(
                                    body.datasets.map(ds => ds.identifier)
                                ).to.contain(dataset.identifier);
                            });
                    }
                }
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

    function randomCase(string: string): string {
        return string
            .split("")
            .map(char =>
                casual.coin_flip ? char.toLowerCase() : char.toUpperCase()
            )
            .join("");
    }
});
