import * as request from "supertest";
import { Server } from "http";
import * as express from "express";
import * as sinon from "sinon";
import { expect } from "chai";

import { Record } from "@magda/typescript-common/dist/generated/registry/api";
import { lcAlphaNumStringArbNe } from "@magda/typescript-common/dist/test/arbitraries";
import jsc from "@magda/typescript-common/dist/test/jsverify";

import SleutherOptions from "../SleutherOptions";
import fakeArgv from "./fakeArgv";
import baseSpec from "./baseSpec";
import Crawler from "../Crawler";
import setupRecrawlEndpoint from "../setupRecrawlEndpoint";

baseSpec(
    "Recrawl APIs",
    (
        expressApp: () => express.Express,
        expressServer: () => Server,
        listenPort: () => number,
        beforeEachProperty: () => void
    ) => {
        it('POST /recrawl: should invoke Crawler.start() and response "crawler started"', () => {
            return jsc.assert(
                jsc.forall(
                    lcAlphaNumStringArbNe,
                    lcAlphaNumStringArbNe,
                    (jwtSecret, userId) => {
                        beforeEachProperty();

                        const crawler = sinon.createStubInstance(Crawler);
                        const app = expressApp();
                        app.listen(listenPort());
                        const server = expressServer();

                        const options: SleutherOptions = {
                            argv: fakeArgv({
                                internalUrl: "example",
                                registryUrl: "example",
                                jwtSecret,
                                userId,
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

                        let startCalled = false;
                        crawler.start.callsFake(() => {
                            startCalled = true;
                            return Promise.resolve();
                        });

                        return request(server)
                            .post("/recrawl")
                            .send("")
                            .expect(200, "crawler started")
                            .then(() => {
                                return startCalled;
                            });
                    }
                ),
                {}
            );
        });

        it('2nd POST /recrawl should invoke not Crawler.start() and response "in progress"', () => {
            return jsc.assert(
                jsc.forall(
                    lcAlphaNumStringArbNe,
                    lcAlphaNumStringArbNe,
                    (jwtSecret, userId) => {
                        beforeEachProperty();

                        const crawler = sinon.createStubInstance(Crawler);
                        const app = expressApp();
                        app.listen(listenPort());
                        const server = expressServer();

                        const options: SleutherOptions = {
                            argv: fakeArgv({
                                internalUrl: "example",
                                registryUrl: "example",
                                jwtSecret,
                                userId,
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

                        let startCalled = false;
                        let isCrawling = false;
                        crawler.start.callsFake(() => {
                            startCalled = true;
                            isCrawling = true;
                            return Promise.resolve();
                        });

                        crawler.isInProgress.callsFake(() => {
                            return isCrawling;
                        });

                        return (async () => {
                            await request(server)
                                .post("/recrawl")
                                .send()
                                .expect(200, "crawler started")
                                .then(() => {
                                    expect(startCalled).to.equal(true);
                                    startCalled = false;
                                });

                            return await request(server)
                                .post("/recrawl")
                                .send()
                                .expect(200, "in progress")
                                .then(() => {
                                    return !startCalled;
                                });
                        })();
                    }
                ),
                {}
            );
        });

        it("GET/crawlerProgress: should invoke Crawler.getProgess() and response its return value in JSON", () => {
            return jsc.assert(
                jsc.forall(
                    lcAlphaNumStringArbNe,
                    lcAlphaNumStringArbNe,
                    lcAlphaNumStringArbNe,
                    jsc.bool,
                    jsc.nat,
                    (
                        jwtSecret,
                        userId,
                        crawlingPageToken,
                        isCrawling,
                        crawledRecordNumber
                    ) => {
                        beforeEachProperty();

                        const crawler = sinon.createStubInstance(Crawler);
                        const app = expressApp();
                        app.listen(listenPort());
                        const server = expressServer();

                        const options: SleutherOptions = {
                            argv: fakeArgv({
                                internalUrl: "example",
                                registryUrl: "example",
                                jwtSecret,
                                userId,
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

                        crawler.getProgess.callsFake(() => {
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
                                crawlingPageToken,
                                isCrawling,
                                crawledRecordNumber
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
