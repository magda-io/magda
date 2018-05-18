import { Server } from "http";
import * as express from "express";
import * as nock from "nock";
import * as _ from "lodash";
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

        //--- function implements generic crawler testing logic
        async function basecrawlerTest(
            registryTotalRecordsNumber: number,
            domain: string,
            jwtSecret: string,
            userId: string,
            concurrency: number,
            async: boolean,
            // --- init func creates other context variables shared among callbacks
            envInit: () => any,
            onRecordFound: (
                record: Record,
                registry: Registry
            ) => Promise<void>,
            registryReplyFunc: (uri: string, requestBody: string) => any,
            propertyCheckingFunc: () => boolean
        ) {
            beforeEachProperty();

            const internalUrl = `http://${domain}.com`;
            const registryDomain = "example_" + registryDomainCounter;
            registryDomainCounter++;
            const registryUrl = `http://${registryDomain}.com:80`;
            const registryScope = nock(registryUrl);

            const registry = new Registry({
                baseUrl: registryUrl,
                jwtSecret: jwtSecret,
                userId: userId
            });

            let context: any = {
                registryTotalRecordsNumber,
                domain,
                jwtSecret,
                userId,
                concurrency,
                async,
                registryScope,
                registry
            };

            const env = envInit.bind(context)();
            if (env && typeof env === "object")
                context = { ...context, ...env };

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
                onRecordFound: onRecordFound.bind(context)
            };

            registryScope
                .persist()
                .get("/records")
                .query(true)
                .reply(registryReplyFunc.bind(context));

            const crawler = new Crawler(registry, options);
            context.crawler = crawler;

            await crawler.start();
            registryScope.done();
            return propertyCheckingFunc.bind(context)();
        }

        function basePropertyTest(
            // --- init func creates other context variables shared among callbacks
            envInit: () => any,
            onRecordFound: (
                record: Record,
                registry: Registry
            ) => Promise<void>,
            registryReplyFunc: (uri: string, requestBody: string) => any,
            propertyCheckingFunc: () => boolean
        ) {
            return jsc.assert(
                jsc.forall(
                    jsc.nat(100),
                    lcAlphaNumStringArbNe,
                    lcAlphaNumStringArbNe,
                    lcAlphaNumStringArbNe,
                    jsc.integer(1, 10),
                    jsc.bool,
                    _.partialRight(
                        basecrawlerTest,
                        envInit,
                        onRecordFound,
                        registryReplyFunc,
                        propertyCheckingFunc
                    )
                )
            );
        }

        it("should crawl all records in registry ONCE start() called ", () => {
            return basePropertyTest(
                function(this: any) {
                    //---envInit
                    //--- this table records whether all records are sent to onRecordFound for only once
                    const recordsTestTable: number[] = new Array(
                        this.registryTotalRecordsNumber
                    ).fill(0);
                    const registryRecords: Record[] = recordsTestTable.map(
                        (item, idx) => ({
                            id: String(idx),
                            name: "",
                            aspects: {},
                            sourceTag: ""
                        })
                    );
                    return { recordsTestTable, registryRecords };
                },
                function(
                    //---onRecordFound
                    this: any,
                    foundRecord: Record,
                    registry: Registry
                ) {
                    const idx = parseInt(foundRecord.id, 10);
                    if (typeof this.recordsTestTable[idx] !== "number") {
                        throw new Error(
                            `try to increase invalid counter at ${idx}`
                        );
                    }
                    this.recordsTestTable[idx]++;
                    return Promise.resolve();
                },
                function(this: any, uri: string, requestBody: string) {
                    //---registryReplyFunc
                    const params = queryString.parseUrl(uri).query;
                    const pageIdx = params.pageToken
                        ? parseInt(params.pageToken, 10)
                        : 0;
                    const limit = parseInt(params.limit, 10);
                    if (limit < 1)
                        throw new Error("Invalid limit param received!");
                    if (pageIdx >= this.registryRecords.length)
                        return [
                            200,
                            {
                                totalCount: this.registryRecords.length,
                                records: new Array()
                            }
                        ];
                    const recordPage = this.registryRecords.slice(
                        pageIdx,
                        pageIdx + limit - 1
                    );
                    return [
                        200,
                        {
                            totalCount: this.registryRecords.length,
                            nextPageToken: String(pageIdx + recordPage.length),
                            records: recordPage
                        }
                    ];
                },
                function(this: any) {
                    //---propertyCheckingFunc
                    return (
                        this.recordsTestTable.findIndex(
                            (item: any) => item !== 1
                        ) === -1
                    );
                }
            );
        }).timeout(20000);

        it("should correctly return crawling progress at every step via getProgress()", () => {
            return basePropertyTest(
                function(this: any) {
                    //---envInit
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
                    const totalCrawledRecordsNumber = 0;

                    const registryRecords: Record[] = new Array(
                        this.registryTotalRecordsNumber
                    )
                        .fill(0)
                        .map((item, idx) => ({
                            id: String(idx),
                            name: "",
                            aspects: {},
                            sourceTag: ""
                        }));
                    return {
                        crawlingProgressHistory,
                        totalCrawledRecordsNumber,
                        registryRecords
                    };
                },
                function(
                    //---onRecordFound
                    this: any,
                    foundRecord: Record,
                    registry: Registry
                ) {
                    const progress = this.crawler.getProgress();
                    const id = parseInt(foundRecord.id, 10);
                    const foundProgressIdx = this.crawlingProgressHistory.findIndex(
                        (item: any) => item.recordIds.indexOf(id) !== -1
                    );
                    const foundProgress = {
                        ...this.crawlingProgressHistory[foundProgressIdx]
                    };
                    delete foundProgress.recordIds;
                    expect(progress).to.deep.equal(foundProgress);
                    return Promise.resolve();
                },
                function(this: any, uri: string, requestBody: string) {
                    //---registryReplyFunc
                    const params = queryString.parseUrl(uri).query;
                    const pageIdx = params.pageToken
                        ? parseInt(params.pageToken, 10)
                        : 0;
                    const limit = parseInt(params.limit, 10);
                    if (limit < 1)
                        throw new Error("Invalid limit param received!");
                    if (pageIdx >= this.registryRecords.length) {
                        return [
                            200,
                            {
                                totalCount: this.registryRecords.length,
                                records: []
                            }
                        ];
                    }
                    const recordPage = this.registryRecords.slice(
                        pageIdx,
                        pageIdx + limit - 1
                    );
                    const crawlingPageTokenValue = pageIdx + recordPage.length;
                    const crawlingPageToken = String(crawlingPageTokenValue);
                    this.totalCrawledRecordsNumber += recordPage.length;
                    this.crawlingProgressHistory.push({
                        recordIds: recordPage.map((item: any) =>
                            parseInt(item.id, 10)
                        ),
                        isCrawling: true,
                        crawlingPageToken: crawlingPageToken,
                        crawledRecordNumber: this.totalCrawledRecordsNumber
                    });
                    return [
                        200,
                        {
                            totalCount: this.registryRecords.length,
                            nextPageToken: crawlingPageToken,
                            records: recordPage
                        }
                    ];
                },
                function(this: any) {
                    //---propertyCheckingFunc
                    return true;
                }
            );
        }).timeout(200000);
    }
);
