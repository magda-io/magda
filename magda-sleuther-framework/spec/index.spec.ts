import {} from "mocha";
import { expect } from "chai";
import sleuther, { SleutherOptions } from "../src/index";
import * as sinon from "sinon";
import * as nock from "nock";
// const { check } = require("mocha-testcheck");
// import { gen } from "testcheck";
///<reference path="./jsverify.d.ts" />
import jsc = require("jsverify");
import * as express from "express";
import * as request from "supertest";
import {
  // Record,
  WebHook,
  AspectDefinition
} from "@magda/typescript-common/src/generated/registry/api";
import Registry from "@magda/typescript-common/src/Registry";
import * as _ from "lodash";

const aspectArb = jsc.record({
  id: jsc.string,
  name: jsc.string,
  jsonSchema: jsc.json
});

const recordArb = jsc.record({
  id: jsc.string,
  name: jsc.string,
  aspects: jsc.array(jsc.json)
});

function fromCode(code: number) {
  return String.fromCharCode(code);
}

function toCode(c: string) {
  return c.charCodeAt(0);
}

// function delayPromise(t: number): Promise<void> {
//   return new Promise(function(resolve) {
//     setTimeout(resolve, t);
//   });
// }

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

// const upperCaseAlphaCharArb = jsc.integer(65, 90).smap(fromCode, toCode);
const lowerCaseAlphaCharArb = jsc.integer(97, 122).smap(fromCode, toCode);
const numArb = jsc.integer(48, 57).smap(fromCode, toCode);
const lcAlphaNumCharArb = jsc.oneof([numArb, lowerCaseAlphaCharArb]);
const lcAlphaNumStringArb = jsc
  .nearray(lcAlphaNumCharArb)
  .smap(arr => arr.join(""), string => string.split(""));

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
  });

  after(() => {
    sinon.restore(console);
  });

  const beforeEachProperty = () => {
    expressApp = express();
    process.env.NODE_PORT = "";
    sinon.stub(expressApp, "listen");
  };

  jsc.property(
    "Should register aspects, hooks and start listening for webhook events",
    jsc.array(aspectArb),
    jsc.nestring,
    lcAlphaNumStringArb,
    lcAlphaNumStringArb,
    jsc.array(jsc.nestring),
    jsc.array(jsc.nestring),
    jsc.suchthat(jsc.integer, int => int > 3000 && int < 3100),
    (
      aspectDefs: AspectDefinition[],
      id: string,
      registryDomain: string,
      listenDomain: string,
      aspects: string[],
      optionalAspects: string[],
      defaultPort: number
    ) => {
      beforeEachProperty();

      const registryUrl = `http://${registryDomain}.com:80`;
      const registryScope = nock(registryUrl);
      const registry: Registry = new Registry({
        baseUrl: registryUrl
      });

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
        lastEvent: null
      };

      aspectDefs.forEach(aspectDef => {
        registryScope
          .put(
            `/aspects/${encodeURIComponent(aspectDef.id).replace("'", "%27")}`,
            aspectDef
          )
          .reply(201, aspectDef);
      });
      registryScope
        .put(`/hooks/${encodeURIComponent(hook.id).replace("'", "%27")}`, hook)
        .reply(201, hook);

      registryScope.get("/records").query(true).reply(200, { records: [] });

      const options: SleutherOptions = {
        registry,
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
    jsc.array(jsc.nestring),
    jsc.array(jsc.nestring),
    jsc.array(recordArb),
    jsc.suchthat(jsc.integer, int => int > 3000 && int < 3100),
    (aspects, optionalAspects, records, pageSize) => {
      beforeEachProperty();
      const registryDomain = "example";
      const registryUrl = `http://${registryDomain}.com:80`;
      const registryScope = nock(registryUrl);
      const registry: Registry = new Registry({
        baseUrl: registryUrl
      });
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
        registry,
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

  jsc.property(
    "should correctly handle incoming webhooks",
    jsc.array(jsc.array(recordArb)),
    jsc.suchthat(jsc.integer, int => int > 0),
    lcAlphaNumStringArb,
    jsc.suchthat(jsc.integer, int => int > 0),
    jsc.integer,
    (
      recordsBatches: object[][],
      pageSize: number,
      domain: string,
      defaultPort: number,
      overridePort: number
    ) => {
      beforeEachProperty();

      const registryDomain = "example";
      const registryUrl = `http://${registryDomain}.com:80`;
      const registryScope = nock(registryUrl);
      const registry: Registry = new Registry({
        baseUrl: registryUrl
      });
      const port = overridePort > 0 ? overridePort : defaultPort;
      if (overridePort > 0) {
        process.env.NODE_PORT = overridePort.toString();
      }

      registryScope.put(/\/hooks\/.*/).reply(201);

      const options: SleutherOptions = {
        registry,
        host: `${domain}.com`,
        defaultPort,
        id: "id",
        aspects: [],
        optionalAspects: [],
        writeAspectDefs: [],
        express: () => expressApp,
        onRecordFound: sinon.stub().callsFake(record => Promise.resolve())
      };
      registryScope.get("/records").query(true).reply(200, { records: [] });

      return sleuther(options)
        .then(() => {
          const listenStub = expressApp.listen as sinon.SinonStub;
          expect(listenStub.calledWith(port)).to.be.true;

          return Promise.all(
            recordsBatches.map((records: object[]) => {
              const test = request(expressApp)
                .post("/hook")
                .set("Content-Type", "application/json")
                .send({
                  records
                })
                .expect(201);

              const queryable = makePromiseQueryable(test);

              expect(queryable.isFulfilled()).to.be.false;

              return queryable.then(() =>
                records.forEach(record =>
                  expect(
                    (options.onRecordFound as sinon.SinonStub).calledWith(
                      record
                    )
                  )
                )
              );
            })
          );
        })
        .then(() => {
          return true;
        });
    }
  );

  describe("error cases", () => {
    it("should handle bad aspect names", () => {});
    it("should handle bad hook names", () => {});
    it("should handle bad domains", () => {});
  });
});
