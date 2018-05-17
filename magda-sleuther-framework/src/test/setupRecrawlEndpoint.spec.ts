import * as request from "supertest";
import { Server } from "http";
import * as express from "express";
import * as sinon from "sinon";

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
        it("should invoke Crawler.start() if receive request: POST /recrawl", () => {
            return jsc.assert(
                jsc.forall(
                    lcAlphaNumStringArbNe,
                    lcAlphaNumStringArbNe,
                    (jwtSecret, userId) => {
                        beforeEachProperty();

                        const crawler = sinon.createStubInstance(Crawler);
                        const server = expressApp();

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

                        setupRecrawlEndpoint(server, options, crawler);

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
    }
);
