import { Server } from "http";
import * as express from "express";
import * as nock from "nock";
import * as sinon from "sinon";
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
        it("should crawl all records in registry once start() called ", () => {
            return jsc.assert(
                jsc.forall(
                    jsc.nat(999),
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

                        const onRecordFound = sinon
                            .stub()
                            .callsFake((foundRecord: Record) => {
                                const idx = parseInt(foundRecord.id, 10);
                                recordsTestTable[idx]++;
                                return Promise.resolve();
                            });

                        const internalUrl = `http://${domain}.com`;
                        const registryDomain = "example";
                        const registryUrl = `http://${registryDomain}.com:80`;
                        const registryScope = nock(registryUrl);

                        registryScope
                            .get("/records")
                            .query(true)
                            .reply(function(uri, requestBody, cb) {
                                const params = queryString.parseUrl(uri).query;
                                const pageIdx = params.start
                                    ? parseInt(params.start, 10)
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
                                            totalCount: 0,
                                            nextPageToken: "",
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
                                        totalCount: recordPage.length,
                                        nextPageToken: String(pageIdx + limit),
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
        });
    }
);
