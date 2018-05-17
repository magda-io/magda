import { Server } from "http";
import * as express from "express";
import * as nock from "nock";
import { expect } from "chai";
import * as queryString from "query-string";
import Registry from "@magda/typescript-common/dist/registry/AuthorizedRegistryClient";

import { Record } from "@magda/typescript-common/dist/generated/registry/api";
import { lcAlphaNumStringArbNe } from "@magda/typescript-common/dist/test/arbitraries";
import jsc from "@magda/typescript-common/dist/test/jsverify";

import SleutherOptions from "../SleutherOptions";
import fakeArgv from "./fakeArgv";
import baseSpec from "./baseSpec";
import Crawler from "../Crawler";

baseSpec(
    "Crawler",
    (
        expressApp: () => express.Express,
        expressServer: () => Server,
        listenPort: () => number,
        beforeEachProperty: () => void
    ) => {
        //--- avoid different property test hit into the same registry domain
        let registryDomainCounter = 0;

        it("should crawl all records in registry ONCE start() called ", () => {
            return jsc.assert(
                jsc.forall(
                    jsc.nat(100),
                    lcAlphaNumStringArbNe,
                    lcAlphaNumStringArbNe,
                    lcAlphaNumStringArbNe,
                    jsc.integer(1, 10),
                    jsc.bool,
                    (
                        registryTotalRecordsNumber,
                        domain,
                        jwtSecret,
                        userId,
                        concurrency,
                        async
                    ) => {
                        beforeEachProperty();

                        //--- this table records whether all records are sent to onRecordFound for only once
                        const recordsTestTable: number[] = new Array(
                            registryTotalRecordsNumber
                        ).fill(0);
                        const registryRecords: Record[] = recordsTestTable.map(
                            (item, idx) => ({
                                id: String(idx),
                                name: "",
                                aspects: {},
                                sourceTag: ""
                            })
                        );

                        const onRecordFound = (foundRecord: Record) => {
                            const idx = parseInt(foundRecord.id, 10);
                            if (typeof recordsTestTable[idx] !== "number") {
                                throw new Error(
                                    `try to increase invalid counter at ${idx}`
                                );
                            }
                            recordsTestTable[idx]++;
                            return Promise.resolve();
                        };

                        const internalUrl = `http://${domain}.com`;
                        const registryDomain =
                            "example_" + registryDomainCounter;
                        registryDomainCounter++;
                        const registryUrl = `http://${registryDomain}.com:80`;
                        const registryScope = nock(registryUrl);

                        registryScope
                            .persist()
                            .get("/records")
                            .query(true)
                            .reply(function(uri, requestBody) {
                                const params = queryString.parseUrl(uri).query;
                                const pageIdx = params.pageToken
                                    ? parseInt(params.pageToken, 10)
                                    : 0;
                                const limit = parseInt(params.limit, 10);
                                if (limit < 1)
                                    throw new Error(
                                        "Invalid limit param received!"
                                    );
                                if (pageIdx >= registryRecords.length)
                                    return [
                                        200,
                                        {
                                            totalCount: registryRecords.length,
                                            records: []
                                        }
                                    ];
                                const recordPage = registryRecords.slice(
                                    pageIdx,
                                    pageIdx + limit - 1
                                );
                                return [
                                    200,
                                    {
                                        totalCount: registryRecords.length,
                                        nextPageToken: String(
                                            pageIdx + recordPage.length
                                        ),
                                        records: recordPage
                                    }
                                ];
                            });

                        const registry = new Registry({
                            baseUrl: registryUrl,
                            jwtSecret: jwtSecret,
                            userId: userId
                        });
                        const options: SleutherOptions = {
                            argv: fakeArgv({
                                internalUrl,
                                registryUrl,
                                jwtSecret,
                                userId,
                                listenPort: listenPort()
                            }),
                            id: "id",
                            aspects: [],
                            optionalAspects: [],
                            writeAspectDefs: [],
                            async,
                            express: expressApp,
                            concurrency: concurrency,
                            onRecordFound
                        };

                        const crawler = new Crawler(registry, options);

                        return (async () => {
                            await crawler.start();
                            registryScope.done();
                            return (
                                recordsTestTable.findIndex(
                                    item => item !== 1
                                ) === -1
                            );
                        })();
                    }
                ),
                {}
            );
        }).timeout(20000);

        it("should correctly return crawling progress at every step via getProgress()", () => {
            return jsc.assert(
                jsc.forall(
                    jsc.nat(100),
                    lcAlphaNumStringArbNe,
                    lcAlphaNumStringArbNe,
                    lcAlphaNumStringArbNe,
                    jsc.integer(1, 10),
                    jsc.bool,
                    (
                        registryTotalRecordsNumber,
                        domain,
                        jwtSecret,
                        userId,
                        concurrency,
                        async
                    ) => {
                        beforeEachProperty();

                        const crawlingProgressHistory: {
                            recordIds: number[];
                            isCrawling: boolean;
                            crawlingPageToken: string;
                            crawledRecordNumber: number;
                        }[] = [
                            {
                                recordIds: [],
                                isCrawling: false,
                                crawlingPageToken: "",
                                crawledRecordNumber: 0
                            }
                        ];
                        let totalCrawledRecordsNumber = 0;

                        const registryRecords: Record[] = new Array(
                            registryTotalRecordsNumber
                        )
                            .fill(0)
                            .map((item, idx) => ({
                                id: String(idx),
                                name: "",
                                aspects: {},
                                sourceTag: ""
                            }));

                        const onRecordFound = (foundRecord: Record) => {
                            const progress = crawler.getProgess();
                            const id = parseInt(foundRecord.id, 10);
                            const recordedProgressIdx = crawlingProgressHistory.findIndex(
                                item => item.recordIds.indexOf(id) !== -1
                            );
                            const previousPageToken =
                                crawlingProgressHistory[recordedProgressIdx - 1]
                                    .crawlingPageToken;
                            const recordedProgress = {
                                ...crawlingProgressHistory[recordedProgressIdx],
                                crawlingPageToken: previousPageToken
                            };
                            delete recordedProgress.recordIds;
                            expect(progress).to.deep.equal(recordedProgress);
                            return Promise.resolve();
                        };

                        const internalUrl = `http://${domain}.com`;
                        const registryDomain =
                            "example_" + registryDomainCounter;
                        registryDomainCounter++;
                        const registryUrl = `http://${registryDomain}.com:80`;
                        const registryScope = nock(registryUrl);

                        registryScope
                            .persist()
                            .get("/records")
                            .query(true)
                            .reply(function(uri, requestBody) {
                                const params = queryString.parseUrl(uri).query;
                                const pageIdx = params.pageToken
                                    ? parseInt(params.pageToken, 10)
                                    : 0;
                                const limit = parseInt(params.limit, 10);
                                if (limit < 1)
                                    throw new Error(
                                        "Invalid limit param received!"
                                    );
                                if (pageIdx >= registryRecords.length) {
                                    return [
                                        200,
                                        {
                                            totalCount: registryRecords.length,
                                            records: []
                                        }
                                    ];
                                }
                                const recordPage = registryRecords.slice(
                                    pageIdx,
                                    pageIdx + limit - 1
                                );
                                const crawlingPageTokenValue =
                                    pageIdx + recordPage.length;
                                const crawlingPageToken = String(
                                    crawlingPageTokenValue
                                );
                                totalCrawledRecordsNumber += recordPage.length;
                                crawlingProgressHistory.push({
                                    recordIds: recordPage.map(item =>
                                        parseInt(item.id, 10)
                                    ),
                                    isCrawling: true,
                                    crawlingPageToken: crawlingPageToken,
                                    crawledRecordNumber: totalCrawledRecordsNumber
                                });
                                return [
                                    200,
                                    {
                                        totalCount: registryRecords.length,
                                        nextPageToken: String(
                                            crawlingPageTokenValue
                                        ),
                                        records: recordPage
                                    }
                                ];
                            });

                        const registry = new Registry({
                            baseUrl: registryUrl,
                            jwtSecret: jwtSecret,
                            userId: userId
                        });
                        const options: SleutherOptions = {
                            argv: fakeArgv({
                                internalUrl,
                                registryUrl,
                                jwtSecret,
                                userId,
                                listenPort: listenPort()
                            }),
                            id: "id",
                            aspects: [],
                            optionalAspects: [],
                            writeAspectDefs: [],
                            async,
                            express: expressApp,
                            concurrency: concurrency == 1 ? 1 : 1,
                            onRecordFound
                        };

                        const crawler = new Crawler(registry, options);

                        return (async () => {
                            await crawler.start();
                            registryScope.done();
                            return true;
                        })();
                    }
                ),
                {}
            );
        }).timeout(200000);
    }
);
