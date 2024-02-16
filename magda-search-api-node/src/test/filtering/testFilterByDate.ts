import {} from "mocha";
import { expect } from "chai";
import supertest from "supertest";
import express from "express";
import _ from "lodash";
import casual from "casual";
import moment from "moment";

import { buildDataset, buildNDatasets } from "../utils/builders.js";
import { Dataset, SearchResult, PeriodOfTime } from "../../model.js";

export default function testFilterByDate(
    app: () => express.Application,
    buildDatasetIndex: (datasets: Dataset[]) => Promise<void>
) {
    describe("by date", () => {
        let datesByMonth: {
            datasets: Dataset[];
            earliest: moment.Moment;
            latest: moment.Moment;
        }[];

        describe("for datasets with a closed date range", async () => {
            before(async () => {
                datesByMonth = _.range(0, 12).map((month) => {
                    const monthMoment = moment().utc().year(2019).month(month);
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
                                    casual.integer(start.unix(), latest.unix())
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
                    //         "YYYY-MM-DD"
                    //     )}&dateTo=${latest.format("YYYY-MM-DD")}`
                    // );
                    await supertest(app())
                        .get(
                            `/datasets?dateFrom=${earliest.toISOString()}&dateTo=${latest.toISOString()}`
                        )
                        .expect(200)
                        .expect((res) => {
                            const body: SearchResult = res.body;

                            const identifiers = body.dataSets.map(
                                (dataset) => dataset.identifier
                            );

                            expect(identifiers).to.have.same.members(
                                datasets.map((ds) => ds.identifier)
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
                        .map((ds) => ds.identifier)
                        .value();

                    await supertest(app())
                        .get(
                            `/datasets?dateFrom=${earliest.toISOString()}&limit=${
                                expectedIdentifiers.length + 1
                            }`
                        )
                        .expect(200)
                        .expect((res) => {
                            const body: SearchResult = res.body;

                            expect(
                                body.dataSets.map((ds) => ds.identifier)
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
                        .map((ds) => ds.identifier)
                        .value();

                    await supertest(app())
                        .get(
                            `/datasets?dateTo=${latest.toISOString()}&limit=${
                                expectedIdentifiers.length + 1
                            }`
                        )
                        .expect(200)
                        .expect((res) => {
                            const body: SearchResult = res.body;

                            expect(
                                body.dataSets.map((ds) => ds.identifier)
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
                        dataset.temporal.end?.date
                            ? "&dateTo=" +
                              encodeURIComponent(
                                  moment(
                                      dataset.temporal.end.date
                                  ).toISOString()
                              )
                            : ""
                    }${
                        dataset.temporal.start && dataset.temporal.start.date
                            ? "&dateFrom=" +
                              encodeURIComponent(
                                  moment(
                                      dataset.temporal.start.date
                                  ).toISOString()
                              )
                            : ""
                    }&limit=${datasets.length}`;

                    await supertest(app())
                        .get(url)
                        .expect(200)
                        .expect((res) => {
                            const body: SearchResult = res.body;

                            expect(
                                body.dataSets.map((ds) => ds.identifier)
                            ).to.contain(dataset.identifier);
                        });
                }
            }
        });

        describe("should understand dates in format:", () => {
            const testFormat = (
                format: string,
                unit: moment.DurationInputArg2
            ) => {
                it(format, async () => {
                    const startDate = moment(casual.date(format), format);

                    const datasets = [
                        buildDataset({
                            temporal: {
                                end: {
                                    date: startDate
                                        .clone()
                                        .subtract(1, unit)
                                        .subtract(1, "ms")
                                        .toISOString()
                                }
                            }
                        }),
                        buildDataset({
                            temporal: {
                                start: {
                                    date: startDate.toISOString()
                                },
                                end: {
                                    date: startDate.toISOString()
                                }
                            }
                        }),
                        buildDataset({
                            temporal: {
                                start: {
                                    date: startDate
                                        .clone()
                                        .add(1, unit)
                                        .add(1, "ms")
                                        .toISOString()
                                }
                            }
                        })
                    ];

                    await buildDatasetIndex(datasets);

                    await supertest(app())
                        .get(
                            `/datasets?dateFrom=${startDate.format(
                                format
                            )}&dateTo=${startDate.format(format)}`
                        )
                        .expect(200)
                        .expect((res) => {
                            const body: SearchResult = res.body;

                            expect(body.dataSets.length).to.equal(1);
                            expect(body.dataSets[0].identifier).to.equal(
                                datasets[1].identifier
                            );
                        });
                });
            };

            testFormat("YY", "year");
            testFormat("YYYY", "year");
            testFormat("YYYY-MM", "month");
            testFormat("YYYY-MM-DD", "day");
            testFormat("YYYY-MM-DDTHH:mm", "minute");
            testFormat("YYYY-MM-DDTHH:mm:ss", "second");
        });
    });
}
