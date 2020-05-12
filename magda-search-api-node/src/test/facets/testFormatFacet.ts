import {} from "mocha";
import { expect } from "chai";
import supertest from "supertest";
import express from "express";
import _ from "lodash";
// import moment from "moment";

import { buildNDatasets } from "../utils/builders";
import { Dataset, SearchResult, FacetOption } from "../../model";

export default function testFormatFacet(
    app: () => express.Application,
    buildDatasetIndex: (datasets: Dataset[]) => Promise<void>
) {
    describe("format facet", function() {
        it("should return correct facets when searching for *", async () => {
            const datasets = await addDatasets();

            return supertest(app())
                .get(`/datasets?query=*&limit=0`)
                .expect(200)
                .expect(res => {
                    const body: SearchResult = res.body;

                    const formatOptions = body.facets.find(
                        facet => facet.id === "Format"
                    ).options;

                    expect(formatOptions).to.deep.equal(
                        getExpectedFormats(datasets, 10)
                    );
                });
        });

        it("should respect facetSize", async () => {
            const datasets = await addDatasets();

            return supertest(app())
                .get(`/datasets?query=*&limit=0&facetSize=5`)
                .expect(200)
                .expect(res => {
                    const body: SearchResult = res.body;

                    const formatOptions = body.facets.find(
                        facet => facet.id === "Format"
                    ).options;

                    expect(formatOptions).to.deep.equal(
                        getExpectedFormats(datasets, 5)
                    );
                });
        });

        it("should mark queried formats as marked", async () => {
            const datasets = await addDatasets();
            const expectedFormats = getExpectedFormats(datasets, 10);

            // Pick a few formats from the top ones.
            const formatIndicesToMatch = [2, 5, 8];
            const requestFormats = _.at(expectedFormats, formatIndicesToMatch);

            return supertest(app())
                .get(
                    `/datasets?query=*&limit=0&${requestFormats
                        .map(format => `format=${format.value}`)
                        .join("&")}`
                )
                .expect(200)
                .expect(res => {
                    const body: SearchResult = res.body;

                    const formatOptions = body.facets.find(
                        facet => facet.id === "Format"
                    ).options;
                    expect(formatOptions.length).to.equal(10);

                    // All matched options should be in the top 3
                    const top3Options = _.take(formatOptions, 3);
                    const matchedOptions = formatOptions.filter(
                        option => option.matched
                    );
                    expect(top3Options).to.deep.equal(matchedOptions);

                    // The top 3 options should be sorted by hitCount then value
                    expect(
                        _(top3Options)
                            .sortBy(option => option.value)
                            .sortBy(option => -option.hitCount)
                            .value()
                    ).to.deep.equal(top3Options);

                    const bottom7Options = formatOptions.slice(3);

                    // Options from 4-10 should all be matched=false
                    expect(bottom7Options.some(option => option.matched)).to.be
                        .false;

                    // Options from 4-10 should also be sorted by hitCount then value
                    expect(
                        _(bottom7Options)
                            .sortBy(option => option.value)
                            .sortBy(option => -option.hitCount)
                            .value()
                    ).to.deep.equal(bottom7Options);
                });
        });

        it("should have correct document counts for the supplied query", async () => {
            const datasets = await addDatasets(200);

            const doTest = (query: string) =>
                supertest(app())
                    // Do a query for every dataset so we know exactly which datasets match the query
                    .get(`/datasets?query=${query}&limit=200`)
                    .expect(200)
                    .expect(res => {
                        const body: SearchResult = res.body;

                        // console.log(`/datasets?query=${query}&limit=200`);

                        expect(body.hitCount).to.be.greaterThan(0);

                        const formatOptions = body.facets.find(
                            facet => facet.id === "Format"
                        ).options;

                        const expectedFormatCounts = _(body.dataSets)
                            .flatMap(dataset =>
                                _(dataset.distributions)
                                    .map(dist => dist.format)
                                    .uniq()
                                    .value()
                            )
                            .countBy(_.identity)
                            .toPairs()
                            .sortBy(pair => pair[0])
                            .sortBy(pair => -pair[1])
                            .take(10)
                            .value();

                        // console.log(formatOptions);

                        expect(expectedFormatCounts).to.deep.equal(
                            formatOptions.map(option => [
                                option.value,
                                option.hitCount
                            ])
                        );
                    });

            // Do a test for * just to make sure it works without a query
            await doTest("*");

            /** All the keywords in all the datasets, ordered by how common they are */
            const keywords = _(datasets)
                .flatMap(ds => ds.keywords)
                .countBy(_.identity)
                .toPairs()
                .sortBy(pair => -pair[1])
                .map(pair => pair[0]);

            /** The first, last and middle keyword */
            const keywordsToTest = [
                keywords.first(),
                keywords.last(),
                keywords.get(Math.floor(keywords.toLength() / 2))
            ];

            for (let keyword of keywordsToTest) {
                await doTest(keyword);
            }
        });

        async function addDatasets(count: number = 15) {
            const datasets = buildNDatasets(count);

            await buildDatasetIndex(datasets);

            return datasets;
        }

        function getExpectedFormats(datasets: Dataset[], size: number) {
            return _(datasets)
                .flatMap(dataset => dataset.distributions)
                .map(distribution => distribution.format)
                .countBy(_.identity)
                .toPairs()
                .sortBy(pair => pair[0])
                .sortBy(pair => -pair[1])
                .map(
                    pair =>
                        ({
                            countErrorUpperBound: -1,
                            value: pair[0],
                            hitCount: pair[1],
                            matched: false
                        } as FacetOption)
                )
                .take(size)
                .value();
        }
    });
}
