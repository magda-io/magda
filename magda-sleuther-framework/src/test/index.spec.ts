import {} from "mocha";
import { expect } from "chai";
import * as sinon from "sinon";
import * as nock from "nock";
///<reference path="@magda/typescript-common/spec/jsverify.d.ts" />
import jsc = require("jsverify");
import * as express from "express";
import * as request from "supertest";
import * as _ from "lodash";
import {
  Record,
  WebHook,
  AspectDefinition
} from "@magda/typescript-common/dist/generated/Registry/api";
import {
  arbFlatMap,
  lcAlphaNumStringArbNe,
  lcAlphaNumStringArb,
  recordArb
} from "@magda/typescript-common/src/test/arbitraries";
import sleuther, { SleutherOptions } from "../index";
import { encodeURIComponentWithApost } from "@magda/typescript-common/src/test/util";

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
  this.timeout(5000);
  let expressApp: express.Express;

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
  });

  after(() => {
    sinon.restore(console);
  });

  const beforeEachProperty = () => {
    expressApp = express();
    process.env.NODE_PORT = "";
    process.env.REGISTRY_URL = "";
    process.env.npm_package_config_registryUrl = "";
    sinon.stub(expressApp, "listen");
  };

  type RegistryUrlMethod = "env var" | "package.json" | "both" | "none";

  type RegistryUrlArbResult = {
    domain: string;
    method: RegistryUrlMethod;
  };

  const registryUrlArb: jsc.Arbitrary<RegistryUrlArbResult> = jsc.record({
    domain: lcAlphaNumStringArbNe(jsc),
    method: jsc.oneof([
      jsc.constant("none"),
      jsc.constant("env var"),
      jsc.constant("package.json"),
      jsc.constant("both")
    ]) as jsc.Arbitrary<RegistryUrlMethod>
  });

  const setRegistryUrl = (arbResult: RegistryUrlArbResult) => {
    if (arbResult.method === "none") {
      return "http://localhost:6101/v0";
    } else {
      const registryUrl = `http://${arbResult.domain}.com`;
      if (arbResult.method === "env var") {
        process.env.REGISTRY_URL = registryUrl;
      } else if (arbResult.method === "package.json") {
        process.env.npm_package_config_registryUrl = registryUrl;
      } else if (arbResult.method === "both") {
        process.env.REGISTRY_URL = registryUrl;
        process.env.npm_package_config_registryUrl = registryUrl;
      }

      return registryUrl;
    }
  };

  jsc.property(
    "Should register aspects, hooks and start listening for webhook events",
    jsc.array(aspectArb),
    jsc.nestring,
    registryUrlArb,
    lcAlphaNumStringArbNe(jsc),
    jsc.array(jsc.nestring),
    jsc.array(jsc.nestring),
    jsc.suchthat(jsc.integer, int => int > 0 && int < 65000),
    (
      aspectDefs: AspectDefinition[],
      id: string,
      registry: RegistryUrlArbResult,
      listenDomain: string,
      aspects: string[],
      optionalAspects: string[],
      defaultPort: number
    ) => {
      beforeEachProperty();
      const registryUrl = setRegistryUrl(registry);
      const registryScope = nock(registryUrl);

      const hook: WebHook = {
        id: id,
        name: id,
        url: `http://${listenDomain}.com:${defaultPort}/hook`,
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
            aspectDef
          )
          .reply(201, aspectDef);
      });
      registryScope
        .put(`/hooks/${encodeURIComponentWithApost(hook.id)}`, hook)
        .reply(201, hook);

      registryScope.get("/records").query(true).reply(200, { records: [] });

      const options: SleutherOptions = {
        host: `${listenDomain}.com`,
        defaultPort: defaultPort,
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
    registryUrlArb,
    jsc.array(jsc.nestring),
    jsc.array(jsc.nestring),
    jsc.array(recordArb(jsc)),
    jsc.suchthat(jsc.integer, int => int > 3000 && int < 3100),
    (registry, aspects, optionalAspects, records, pageSize) => {
      beforeEachProperty();
      const registryUrl = setRegistryUrl(registry);
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

            return index === "0" ||
              actualQuery.pageToken === index, actualQuery.dereference &&
              arraysEqual(aspects, makeArray(actualQuery.aspect)) &&
              arraysEqual(
                optionalAspects,
                makeArray(actualQuery.optionalAspect)
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
        host: `example.com`,
        defaultPort: 80,
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
                expect(sleutherPromise.isFulfilled()).to.be.false;

                resolves.forEach(resolve => resolve());
              }
            })
        )
      };

      const sleutherPromise = makePromiseQueryable(sleuther(options));

      return sleutherPromise.then(() => {
        records.forEach((record: object) => {
          expect((options.onRecordFound as sinon.SinonSpy).calledWith(record));
        });

        return true;
      });
    }
  );

  describe("webhooks", () => {
    const doWebhookTest = (caption: string, async: boolean) => {
      const batchResultsArb = jsc.array(jsc.bool);

      const recordWithSuccessArb = (mightFail: boolean) =>
        jsc.record({
          record: recordArb(jsc),
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
        jsc,
        batchResultsArb,
        batchResults => {
          const batchArb = batchResults.map(overallSuccess =>
            recordsWithSuccessArrArb(overallSuccess).smap(
              records => ({ records, overallSuccess }),
              ({ records }) => records
            )
          );
          return batchArb.length > 0 ? jsc.tuple(batchArb) : jsc.constant([]);
        },
        batches => batches.map(({ overallSuccess }) => overallSuccess)
      );

      jsc.property(
        caption,
        batchArb,
        lcAlphaNumStringArbNe(jsc),
        (recordsBatches: Batch[], domain: string) => {
          beforeEachProperty();

          const registryDomain = "example";
          const registryUrl = `http://${registryDomain}.com:80`;
          process.env.REGISTRY_URL = registryUrl;
          const registryScope = nock(registryUrl);

          registryScope.put(/\/hooks\/.*/).reply(201);

          /** All records in all the batches */
          const flattenedRecords = _.flatMap(
            recordsBatches,
            batch => batch.records
          );
          /** Error thrown when the call is *supposed* to fail  */
          const fakeError = new Error("Fake-ass testing error");
          (fakeError as any).ignore = true;

          const options: SleutherOptions = {
            host: `${domain}.com`,
            defaultPort: 80,
            id: "id",
            aspects: [],
            optionalAspects: [],
            writeAspectDefs: [],
            async,
            express: () => expressApp,
            onRecordFound: sinon.stub().callsFake((foundRecord: Record) => {
              const match = flattenedRecords.find(({ record: thisRecord }) => {
                return thisRecord.id === foundRecord.id;
              });
              return match.success
                ? Promise.resolve()
                : Promise.reject(fakeError);
            })
          };
          registryScope.get("/records").query(true).reply(200, { records: [] });

          /** Global hook id generator - incremented every time we create another hook */
          let lastHookId = 0;
          return sleuther(options)
            .then(() =>
              Promise.all(
                recordsBatches.map(batch => {
                  lastHookId++;

                  if (async) {
                    // If we're running async then we expect that there'll be a call to the registry
                    // telling it to give more events.
                    registryScope
                      .post(`/hooks/${lastHookId}`, {
                        succeeded: batch.overallSuccess,
                        lastEventIdReceived: lastHookId
                      })
                      .reply(201);
                  }

                  // Send the hook payload to the sleuther
                  const test = request(expressApp)
                    .post("/hook")
                    .set("Content-Type", "application/json")
                    .send({
                      records: batch.records.map(({ record }) => record),
                      deferredResponseUrl: `${registryUrl}/hooks/${lastHookId}`,
                      lastEventId: lastHookId
                    })
                    // The hook should only return 500 if it's failed synchronously.
                    .expect(async || batch.overallSuccess ? 201 : 500)
                    .then((response: any) => {
                      expect(!!response.body.deferResponse).to.equal(async);
                    });

                  const queryable = makePromiseQueryable(test);

                  expect(queryable.isFulfilled()).to.be.false;

                  return queryable.then(() =>
                    batch.records.forEach(({ record }) =>
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
      );
    };

    doWebhookTest("should work synchronously", false);
    doWebhookTest("should work asynchronously", true);
  });

  const containsBlanks = (strings: string[]) =>
    strings.some(string => string === "");

  type input = {
    port: number;
    host: string;
    id: string;
    aspects: string[];
    optionalAspects: string[];
  };

  jsc.property(
    "should handle bad inputs",
    jsc.suchthat(
      jsc.record({
        port: jsc.integer,
        host: lcAlphaNumStringArb(jsc),
        id: lcAlphaNumStringArb(jsc),
        aspects: jsc.array(lcAlphaNumStringArb(jsc)),
        optionalAspects: jsc.array(lcAlphaNumStringArb(jsc))
      }),
      (record: input) =>
        // return true;
        record.port <= 0 ||
        record.port >= 65535 ||
        record.host === "" ||
        record.id === "" ||
        containsBlanks(record.aspects) ||
        containsBlanks(record.optionalAspects)
    ),
    ({ port, host, id, aspects, optionalAspects }: input) => {
      beforeEachProperty();

      const options: SleutherOptions = {
        host: host,
        defaultPort: port,
        id: id,
        aspects: aspects,
        optionalAspects: optionalAspects,
        writeAspectDefs: [],
        express: () => expressApp,
        onRecordFound: sinon.stub().callsFake(record => Promise.resolve())
      };

      return sleuther(options).then(() => false).catch(() => true);
    }
  );
});
