import request from "supertest";
import { Server } from "http";
import express from "express";
import sinon from "sinon";
import { expect } from "chai";

import { Record } from "magda-typescript-common/src/generated/registry/api.js";
import { lcAlphaNumStringArbNe } from "magda-typescript-common/src/test/arbitraries.js";
import jsc from "jsverify";

import MinionOptions from "../MinionOptions.js";
import fakeArgv from "./fakeArgv.js";
import baseSpec from "./baseSpec.js";
import Crawler from "../Crawler.js";
import setupRecrawlEndpoint from "../setupRecrawlEndpoint.js";

baseSpec(
    "Recrawl APIs",
    (
        expressApp: () => express.Express,
        expressServer: () => Server,
        listenPort: () => number,
        beforeEachProperty: () => void
    ) => {
        it("POST /recrawl: should invoke Crawler.start() and response correct response", () => {
            beforeEachProperty();

            const crawler = sinon.createStubInstance(Crawler);
            const app = expressApp();
            app.listen(listenPort());
            const server = expressServer();

            const options: MinionOptions = {
                argv: fakeArgv({
                    internalUrl: "example",
                    registryUrl: "example",
                    enableMultiTenant: true,
                    tenantUrl: "example",
                    jwtSecret: "jwtSecret",
                    userId: "b1fddd6f-e230-4068-bd2c-1a21844f1598",
                    listenPort: listenPort()
                }),
                id: "id",
                aspects: [],
                optionalAspects: [],
                writeAspectDefs: [],
                async: true,
                express: expressApp,
                concurrency: 1,
                onRecordFound: (recordFound: Record) => {
                    return Promise.resolve();
                }
            };

            setupRecrawlEndpoint(app, options, crawler);

            return request(server)
                .post("/recrawl")
                .send()
                .expect(200, {
                    isSuccess: true,
                    isNewCrawler: true
                })
                .then(() => {
                    expect(crawler.start.callCount).to.equal(1);
                });
        });

        it("2nd POST /recrawl should invoke not Crawler.start() and response correct response", async () => {
            beforeEachProperty();

            const crawler = sinon.createStubInstance(Crawler);
            const app = expressApp();
            app.listen(listenPort());
            const server = expressServer();

            const options: MinionOptions = {
                argv: fakeArgv({
                    internalUrl: "example",
                    registryUrl: "example",
                    enableMultiTenant: true,
                    tenantUrl: "example",
                    jwtSecret: "jwtSecret",
                    userId: "b1fddd6f-e230-4068-bd2c-1a21844f1598",
                    listenPort: listenPort()
                }),
                id: "id",
                aspects: [],
                optionalAspects: [],
                writeAspectDefs: [],
                async: true,
                express: expressApp,
                concurrency: 1,
                onRecordFound: (recordFound: Record) => {
                    return Promise.resolve();
                }
            };

            setupRecrawlEndpoint(app, options, crawler);

            let isCrawling = false;
            crawler.start.callsFake(() => {
                isCrawling = true;
                return Promise.resolve();
            });

            crawler.isInProgress.callsFake(() => {
                return isCrawling;
            });

            await request(server)
                .post("/recrawl")
                .send()
                .expect(200, {
                    isSuccess: true,
                    isNewCrawler: true
                })
                .then(() => {
                    expect(crawler.start.callCount).to.equal(1);
                });

            await request(server)
                .post("/recrawl")
                .send()
                .expect(200, {
                    isSuccess: true,
                    isNewCrawler: false
                })
                .then(() => {
                    // --- should still be 1 i.e. no calling this time
                    expect(crawler.start.callCount).to.equal(1);
                });
        });

        it("GET/crawlerProgress: should invoke Crawler.getProgress() and response its return value in JSON", () => {
            return jsc.assert(
                jsc.forall(
                    lcAlphaNumStringArbNe,
                    jsc.bool,
                    jsc.nat,
                    (crawlingPageToken, isCrawling, crawledRecordNumber) => {
                        beforeEachProperty();

                        const crawler = sinon.createStubInstance(Crawler);
                        const app = expressApp();
                        app.listen(listenPort());
                        const server = expressServer();

                        const options: MinionOptions = {
                            argv: fakeArgv({
                                internalUrl: "example",
                                registryUrl: "example",
                                enableMultiTenant: true,
                                tenantUrl: "example",
                                jwtSecret: "jwtSecret",
                                userId: "b1fddd6f-e230-4068-bd2c-1a21844f1598",
                                listenPort: listenPort()
                            }),
                            id: "id",
                            aspects: [],
                            optionalAspects: [],
                            writeAspectDefs: [],
                            async: true,
                            express: expressApp,
                            concurrency: 1,
                            onRecordFound: (recordFound: Record) => {
                                return Promise.resolve();
                            }
                        };

                        setupRecrawlEndpoint(app, options, crawler);

                        crawler.getProgress.callsFake(() => {
                            return {
                                crawlingPageToken,
                                isCrawling,
                                crawledRecordNumber
                            };
                        });

                        return request(server)
                            .get("/crawlerProgress")
                            .send()
                            .expect(200, {
                                isSuccess: true,
                                progress: {
                                    crawlingPageToken,
                                    isCrawling,
                                    crawledRecordNumber
                                }
                            })
                            .then(() => {
                                return true;
                            });
                    }
                ),
                {}
            );
        });
    }
);
