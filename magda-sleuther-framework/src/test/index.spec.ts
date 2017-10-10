import {} from "mocha";
import { expect } from "chai";
import * as sinon from "sinon";
import * as nock from "nock";
import jsc from "@magda/typescript-common/dist/test/jsverify";
import * as express from "express";
import * as request from "supertest";
import * as _ from "lodash";
const portfinder = require("portfinder");
import {
    Record,
    WebHook,
    AspectDefinition
} from "@magda/typescript-common/dist/generated/registry/api";
import {
    arbFlatMap,
    lcAlphaNumStringArbNe,
    lcAlphaNumStringArb,
    recordArb
} from "@magda/typescript-common/dist/test/arbitraries";
import sleuther, { SleutherOptions } from "../index";
import { encodeURIComponentWithApost } from "@magda/typescript-common/dist/test/util";
import { SleutherArguments } from "../commonYargs";
import buildJwt from "@magda/typescript-common/dist/session/buildJwt";
import { Server } from "http";

const aspectArb = jsc.record({
    id: jsc.string,
    name: jsc.string,
    jsonSchema: jsc.json
});

interface QueryablePromise<W> extends Promise<W> {
    isResolved: () => boolean;
    isRejected: () => boolean;
    isFulfilled: () => boolean;
    isQueryable: boolean;
}

function makePromiseQueryable<W>(
    promise: Promise<W> | QueryablePromise<W>
): QueryablePromise<W> {
    // Don't create a wrapper for promises that can already be queried.
    const castPromise = promise as QueryablePromise<W>;
    if (castPromise.isQueryable) {
        return castPromise;
    }

    var isResolved = false;
    var isRejected = false;

    // Observe the promise, saving the fulfillment in a closure scope.
    var result: any = promise.then(
        function(v) {
            isResolved = true;
            return v;
        },
        function(e) {
            isRejected = true;
            throw e;
        }
    );
    result.isQueryable = true;
    result.isFulfilled = function() {
        return isResolved || isRejected;
    };
    result.isResolved = function() {
        return isResolved;
    };
    result.isRejected = function() {
        return isRejected;
    };
    return result;
}

function arraysEqual(a: any[], b: any[]) {
    if (a === b) return true;
    if (a == null || b == null) return false;
    if (a.length != b.length) return false;

    for (var i = 0; i < a.length; ++i) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}

describe("Sleuther framework", function(this: Mocha.ISuiteCallbackContext) {
    this.timeout(100000);
    let expressApp: express.Express;
    let expressServer: Server;
    let listenPort: number;

    before(() => {
        sinon.stub(console, "info");

        const originalConsoleError = console.error;
        sinon.stub(console, "error").callsFake((...args) => {
            // console.log(args[0].message);
            // console.log(fakeError.message);
            if (!args[0] || !args[0].ignore) {
                originalConsoleError(...args);
            }
        });

        return portfinder.getPortPromise().then((port: number) => {
            listenPort = port;
        });
    });

    after(() => {
        sinon.restore(console);
    });

    const beforeEachProperty = () => {
        if (expressServer) {
            expressServer.close();
        }
        expressApp = express();
        const originalListen = expressApp.listen;
        sinon.stub(expressApp, "listen").callsFake(port => {
            expressServer = originalListen.bind(expressApp)(port);
            return expressServer;
        });
    };

    jsc.property(
        "Should register aspects, hooks and start listening for webhook events",
        jsc.array(aspectArb),
        jsc.nestring,
        lcAlphaNumStringArbNe,
        lcAlphaNumStringArbNe,
        jsc.array(jsc.nestring),
        jsc.array(jsc.nestring),
        lcAlphaNumStringArbNe,
        lcAlphaNumStringArbNe,
        (
            aspectDefs: AspectDefinition[],
            id: string,
            registryHost: string,
            listenDomain: string,
            aspects: string[],
            optionalAspects: string[],
            jwtSecret: string,
            userId: string
        ) => {
            beforeEachProperty();
            const registryUrl = `http://${registryHost}.com`;
            const registryScope = nock(registryUrl);

            const internalUrl = `http://${listenDomain}.com:${listenPort}`;

            const hook: WebHook = {
                id: id,
                name: id,
                url: `${internalUrl}/hook`,
                active: true,
                userId: 0,
                eventTypes: [
                    "CreateRecord",
                    "CreateAspectDefinition",
                    "CreateRecordAspect",
                    "PatchRecord",
                    "PatchAspectDefinition",
                    "PatchRecordAspect"
                ],
                config: {
                    aspects: aspects,
                    optionalAspects: optionalAspects,
                    includeEvents: false,
                    includeAspectDefinitions: false,
                    dereference: true,
                    includeRecords: true
                },
                lastEvent: null,
                isWaitingForResponse: false
            };

            aspectDefs.forEach(aspectDef => {
                registryScope
                    .put(
                        `/aspects/${encodeURIComponentWithApost(aspectDef.id)}`,
                        aspectDef,
                        {
                            reqheaders: reqHeaders(jwtSecret, userId)
                        }
                    )
                    .reply(201, aspectDef);
            });
            registryScope
                .put(`/hooks/${encodeURIComponentWithApost(hook.id)}`, hook, {
                    reqheaders: reqHeaders(jwtSecret, userId)
                })
                .reply(201, hook);

            registryScope
                .get("/records")
                .query(true)
                .reply(200, { records: [] });

            const options: SleutherOptions = {
                argv: fakeArgv({
                    internalUrl,
                    registryUrl,
                    jwtSecret,
                    userId
                }),
                id,
                aspects: hook.config.aspects,
                optionalAspects: hook.config.optionalAspects,
                writeAspectDefs: aspectDefs,
                express: () => expressApp,
                onRecordFound: record => Promise.resolve()
            };

            return sleuther(options).then(() => {
                registryScope.done();
                return true;
            });
        }
    );

    jsc.property(
        "should properly crawl existing",
        lcAlphaNumStringArbNe,
        jsc.array(jsc.nestring),
        jsc.array(jsc.nestring),
        jsc.array(recordArb),
        jsc.suchthat(jsc.integer, int => int > 3000 && int < 3100),
        lcAlphaNumStringArbNe,
        lcAlphaNumStringArbNe,
        (
            registryHost,
            aspects,
            optionalAspects,
            records,
            pageSize,
            jwtSecret,
            userId
        ) => {
            beforeEachProperty();
            const registryUrl = `http://${registryHost}.com`;
            const registryScope = nock(registryUrl);
            registryScope.put(/\/hooks\/.*/).reply(201);

            let index = 0;
            const pages = _.groupBy(records, (element: any) => {
                return Math.floor(index++ / pageSize);
            });
            pages[index + 1] = [];

            _.forEach(pages, (pageRecords: any, index: string) => {
                registryScope
                    .get("/records")
                    .query((actualQuery: any) => {
                        const makeArray = (maybeArray: any | any[]) => {
                            if (!maybeArray) {
                                return [];
                            } else if (Array.isArray(maybeArray)) {
                                return maybeArray;
                            } else {
                                return [maybeArray];
                            }
                        };

                        return (
                            index === "0" || actualQuery.pageToken === index,
                            actualQuery.dereference &&
                                arraysEqual(
                                    aspects,
                                    makeArray(actualQuery.aspect)
                                ) &&
                                arraysEqual(
                                    optionalAspects,
                                    makeArray(actualQuery.optionalAspect)
                                )
                        );
                    })
                    .reply(200, {
                        totalCount: records.length,
                        nextPageToken: parseInt(index) + 1,
                        records: pageRecords
                    });
            });

            const resolves: (() => void)[] = [];
            const options: SleutherOptions = {
                argv: fakeArgv({
                    internalUrl: `http://example.com`,
                    registryUrl,
                    jwtSecret,
                    userId
                }),
                id: "id",
                aspects: aspects,
                optionalAspects: optionalAspects,
                writeAspectDefs: [],
                express: () => expressApp,
                onRecordFound: sinon.stub().callsFake(
                    () =>
                        new Promise((resolve, reject) => {
                            resolves.push(resolve);

                            if (resolves.length === records.length) {
                                expect(sleutherPromise.isFulfilled()).to.be
                                    .false;

                                resolves.forEach(resolve => resolve());
                            }
                        })
                )
            };

            const sleutherPromise = makePromiseQueryable(sleuther(options));

            return sleutherPromise.then(() => {
                records.forEach((record: object) => {
                    expect(
                        (options.onRecordFound as sinon.SinonSpy).calledWith(
                            record
                        )
                    );
                });

                return true;
            });
        }
    );

    describe("webhooks", () => {
        const doWebhookTest = (caption: string, async: boolean) => {
            it(caption, () => {
                const batchResultsArb = jsc.suchthat(
                    jsc.array(jsc.bool),
                    array => array.length <= 5
                );

                const recordWithSuccessArb = (mightFail: boolean) =>
                    jsc.record({
                        record: recordArb,
                        success: mightFail ? jsc.bool : jsc.constant(true)
                    });

                const recordsWithSuccessArrArb = (success: boolean) => {
                    const baseArb = jsc.array(recordWithSuccessArb(!success));

                    return success
                        ? baseArb
                        : jsc.suchthat(baseArb, combined =>
                              combined.some(({ success }) => !success)
                          );
                };

                type Batch = {
                    /** Each record in the batch and whether it should succeed when
                    *  onRecordFound is called */
                    records: { record: Record; success: boolean }[];
                    /** Whether the overall batch should succeed - to succeed, every record
                    *  should succeed, to fail then at least one record should fail. */
                    overallSuccess: boolean;
                };

                const batchArb = arbFlatMap<boolean[], Batch[]>(
                    batchResultsArb,
                    batchResults => {
                        const batchArb = batchResults.map(overallSuccess =>
                            recordsWithSuccessArrArb(overallSuccess).smap(
                                records => ({ records, overallSuccess }),
                                ({ records }) => records
                            )
                        );
                        return batchArb.length > 0
                            ? jsc.tuple(batchArb)
                            : jsc.constant([]);
                    },
                    batches =>
                        batches.map(({ overallSuccess }) => overallSuccess)
                );

                /** Global hook id generator - incremented every time we create another hook */
                let lastHookId = 0;
                return jsc.assert(
                    jsc.forall(
                        batchArb,
                        lcAlphaNumStringArbNe,
                        lcAlphaNumStringArbNe,
                        lcAlphaNumStringArbNe,
                        (recordsBatches, domain, jwtSecret, userId) => {
                            beforeEachProperty();

                            const registryDomain = "example";
                            const registryUrl = `http://${registryDomain}.com:80`;
                            const registryScope = nock(registryUrl);

                            registryScope.put(/\/hooks\/.*/).reply(201);

                            /** All records in all the batches */
                            const flattenedRecords = _.flatMap(
                                recordsBatches,
                                batch => batch.records
                            );
                            /** Error thrown when the call is *supposed* to fail  */
                            const fakeError = new Error(
                                "Fake-ass testing error"
                            );
                            (fakeError as any).ignore = true;

                            const internalUrl = `http://${domain}.com`;

                            const options: SleutherOptions = {
                                argv: fakeArgv({
                                    internalUrl,
                                    registryUrl,
                                    jwtSecret,
                                    userId
                                }),
                                id: "id",
                                aspects: [],
                                optionalAspects: [],
                                writeAspectDefs: [],
                                async,
                                express: () => expressApp,
                                onRecordFound: sinon
                                    .stub()
                                    .callsFake((foundRecord: Record) => {
                                        const match = flattenedRecords.find(
                                            ({ record: thisRecord }) => {
                                                return (
                                                    thisRecord.id ===
                                                    foundRecord.id
                                                );
                                            }
                                        );
                                        return match.success
                                            ? Promise.resolve()
                                            : Promise.reject(fakeError);
                                    })
                            };
                            registryScope
                                .get("/records")
                                .query(true)
                                .reply(200, { records: [] });

                            return sleuther(options)
                                .then(() =>
                                    Promise.all(
                                        recordsBatches.map(batch => {
                                            lastHookId++;

                                            if (async) {
                                                // If we're running async then we expect that there'll be a call to the registry
                                                // telling it to give more events.
                                                registryScope
                                                    .post(
                                                        `/hooks/${lastHookId}`,
                                                        {
                                                            succeeded:
                                                                batch.overallSuccess,
                                                            lastEventIdReceived: lastHookId
                                                        }
                                                    )
                                                    .reply(201);
                                            }

                                            // Send the hook payload to the sleuther
                                            const test = request(expressServer)
                                                .post("/hook")
                                                .set(
                                                    "Content-Type",
                                                    "application/json"
                                                )
                                                .send({
                                                    records: batch.records.map(
                                                        ({ record }) => record
                                                    ),
                                                    deferredResponseUrl: `${registryUrl}/hooks/${lastHookId}`,
                                                    lastEventId: lastHookId
                                                })
                                                .expect((response: any) => {
                                                    if (
                                                        response.status !==
                                                            201 &&
                                                        response.status !== 500
                                                    ) {
                                                        console.log(response);
                                                    }
                                                })
                                                // The hook should only return 500 if it's failed synchronously.
                                                .expect(
                                                    async ||
                                                    batch.overallSuccess
                                                        ? 201
                                                        : 500
                                                )
                                                .expect((response: any) => {
                                                    expect(
                                                        !!response.body
                                                            .deferResponse
                                                    ).to.equal(async);
                                                });

                                            const queryable = makePromiseQueryable(
                                                test
                                            );

                                            expect(queryable.isFulfilled()).to
                                                .be.false;

                                            return queryable.then(() =>
                                                batch.records.forEach(
                                                    ({ record }) =>
                                                        expect(
                                                            (options.onRecordFound as sinon.SinonStub).calledWith(
                                                                record
                                                            )
                                                        )
                                                )
                                            );
                                        })
                                    )
                                )
                                .then(() => {
                                    registryScope.done();
                                    return true;
                                });
                        }
                    ),
                    {}
                );
            });
        };

        doWebhookTest("should work synchronously", false);
        doWebhookTest("should work asynchronously", true);
    });

    const containsBlanks = (strings: string[]) =>
        strings.some(string => string === "");

    type input = {
        port: number;
        internalUrl: string;
        id: string;
        jwtSecret: string;
        userId: string;
        registryUrl: string;
        aspects: string[];
        optionalAspects: string[];
    };

    jsc.property(
        "should handle bad inputs",
        jsc.suchthat(
            jsc.record({
                port: jsc.integer,
                internalUrl: lcAlphaNumStringArb,
                id: lcAlphaNumStringArb,
                aspects: jsc.array(lcAlphaNumStringArb),
                optionalAspects: jsc.array(lcAlphaNumStringArb),
                jwtSecret: lcAlphaNumStringArb,
                userId: lcAlphaNumStringArb,
                registryUrl: lcAlphaNumStringArb
            }),
            (record: input) =>
                record.port <= 0 ||
                record.port >= 65535 ||
                record.internalUrl === "" ||
                record.id === "" ||
                containsBlanks(record.aspects) ||
                containsBlanks(record.optionalAspects) ||
                record.jwtSecret === "" ||
                record.userId === "" ||
                record.registryUrl === ""
        ),
        ({
            port,
            internalUrl,
            id,
            aspects,
            optionalAspects,
            jwtSecret,
            userId
        }: input) => {
            beforeEachProperty();

            const options: SleutherOptions = {
                argv: fakeArgv({
                    internalUrl: internalUrl,
                    listenPort: port,
                    registryUrl: "",
                    jwtSecret,
                    userId
                }),
                id: id,
                aspects: aspects,
                optionalAspects: optionalAspects,
                writeAspectDefs: [],
                express: () => expressApp,
                onRecordFound: sinon
                    .stub()
                    .callsFake(record => Promise.resolve())
            };

            return sleuther(options)
                .then(() => false)
                .catch(() => true);
        }
    );

    function fakeArgv(options: {
        internalUrl: string;
        registryUrl: string;
        jwtSecret: string;
        userId: string;
        listenPort?: number;
    }): SleutherArguments {
        return {
            listenPort: listenPort,
            ...options,
            $0: "",
            _: []
        };
    }
});

function reqHeaders(jwtSecret: string, userId: string) {
    return {
        "X-Magda-Session": buildJwt(jwtSecret, userId)
    };
}
