import {} from "mocha";
import { expect } from "chai";
import supertest from "supertest";
import express from "express";
import _ from "lodash";
import moment from "moment";

import { buildDataset, buildNDatasets } from "../utils/builders.js";
import { Dataset, SearchResult } from "../../model.js";

export default function testSearchNoQuery(
    app: () => express.Application,
    buildDatasetIndex: (datasets: Dataset[]) => Promise<void>
) {
    describe("by '*'", function () {
        it("should return all datasets when searching by *", async () => {
            const datasets = buildNDatasets(15);

            await buildDatasetIndex(datasets);

            return supertest(app())
                .get(`/datasets?query=*&limit=${datasets.length}`)
                .expect(200)
                .expect((res) => {
                    expect(res.body.hitCount).to.equal(datasets.length);
                });
        });

        it("hitCount should reflect all hits in the system, not just what is returned on the page", async () => {
            const datasets = buildNDatasets(14);
            const halfMax = 7;

            await buildDatasetIndex(datasets);

            return supertest(app())
                .get(`/datasets?query=*&limit=${halfMax}`)
                .expect(200)
                .expect((res) => {
                    const body: SearchResult = res.body;
                    expect(body.hitCount).to.equal(datasets.length);
                    expect(body.dataSets.length).to.equal(halfMax);
                });
        });

        describe("temporal should show the earliest and latest date", () => {
            it("for datasets with fully populated data fields", async () => {
                const datasets = buildNDatasets(15);

                for (let i = 0; i < 15; i++) {
                    datasets[i].temporal = {
                        start: {
                            date: moment
                                .utc({
                                    date: i,
                                    month: 0,
                                    year: 2020
                                })
                                .toISOString()
                        },
                        end: {
                            date: moment
                                .utc({
                                    date: i + 1,
                                    month: 0,
                                    year: 2020
                                })
                                .toISOString()
                        }
                    };
                }

                await buildDatasetIndex(datasets);

                return supertest(app())
                    .get(`/datasets?query=*`)
                    .expect(200)
                    .expect((res) => {
                        const body: SearchResult = res.body;
                        expect(body.temporal.start?.date).to.contain(
                            "2020-01-01"
                        );
                        expect(body.temporal.end?.date).to.contain(
                            "2020-01-15"
                        );
                    });
            });
        });

        describe("should sort by quality", () => {
            const insertAndCheckOrder = async (datasets: Dataset[]) => {
                const reversed = _.reverse(datasets);
                const shuffled = _.shuffle(reversed);

                const toTry = [reversed, shuffled];

                for (let order of toTry) {
                    await buildDatasetIndex(order);

                    await supertest(app())
                        .get(`/datasets?query=*&limit=${order.length}`)
                        .expect(200)
                        .expect((res) => {
                            const body: SearchResult = res.body;

                            expect(
                                body.dataSets.map((dataset) => [
                                    dataset.identifier,
                                    dataset.quality
                                ])
                            ).to.eql(
                                datasets.map((dataset) => [
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
}
