import {} from "mocha";
import { expect } from "chai";
import supertest from "supertest";
import express from "express";
import _ from "lodash";
import casual from "casual";

import {
    buildDataset,
    buildNDatasets,
    buildDistribution,
    buildNDistributions,
    buildPublisher
} from "../utils/builders";
import { Dataset, SearchResult } from "../../model";

export default function testSearchByKeyword(
    app: () => express.Application,
    buildDatasetIndex: (datasets: Dataset[]) => Promise<void>
) {
    it("should return a dataset that contains the keyword & it's synonyms for synonyms group 300032733 `agile`, `nimble`, `quick` & `spry`", async () => {
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
            await supertest(app())
                .get(`/datasets?query=${synonym}`)
                .expect(200)
                .expect((res) => {
                    const body: SearchResult = res.body;
                    const identifiers = body.dataSets.map(
                        (dataset) => dataset.identifier
                    );

                    expect(identifiers).to.contain(targetDataset1.identifier);

                    expect(identifiers).to.contain(targetDataset2.identifier);
                });
        }
    });

    describe("searching for keywords", () => {
        testKeywordSearch("rivers near ballarat", "rivers near ballarat");
    });

    describe("searching for quotes", () => {
        testKeywordSearch("rivers near ballarat", '"rivers near ballarat"');
    });

    /**
     * For a number of fields inside a dataset, this inserts a bunch of datasets
     * including one dataset that has `termInData` in the field in question, then
     * tries to query for that dataset using `termInQuery`.
     */
    function testKeywordSearch(termInData: string, termInQuery: string) {
        const testField = async (override: any) => {
            const targetDataset = buildDataset(override);

            const datasets = _.shuffle([targetDataset, ...buildNDatasets(50)]);

            await buildDatasetIndex(datasets);

            await supertest(app())
                .get(`/datasets?query=${termInQuery}`)
                .expect(200)
                .expect((res) => {
                    const body: SearchResult = res.body;

                    expect(body.hitCount).to.be.greaterThan(0);
                    expect(body.dataSets[0].identifier).to.equal(
                        targetDataset.identifier
                    );
                });
        };

        describe(`'${termInQuery}' should be able to be found verbatim somewhere in a dataset for:`, () => {
            it("description", async () => {
                await testField({
                    description: `${casual.description} ${termInData} ${casual.description}`
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
                            description: `${casual.description} ${termInData} ${casual.description}`
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
                        `${casual.short_description} ${termInData} ${casual.short_description}`,
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
                            `${casual.short_description} ${termInData} ${casual.short_description}`,
                            ...casual.array_of_words(5)
                        ])
                    });
                });

                it("publisher name", async () => {
                    await testField({
                        publisher: buildPublisher({
                            name: `${casual.title} ${termInData} ${casual.title}`
                        })
                    });
                });

                it("publisher description", async () => {
                    await testField({
                        publisher: buildPublisher({
                            description: `${casual.description} ${termInData} ${casual.description}`
                        })
                    });
                });

                it("format", async () => {
                    await testField({
                        format: `${casual.short_description} ${termInData} ${casual.short_description}`
                    });
                });

                it("exact format", async () => {
                    await testField({
                        format: termInData
                    });
                });
            });
        });
    }
}
