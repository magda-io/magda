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

describe("Sleuther framework", () => {
  let fakeExpress: {
    get: sinon.SinonSpy;
    listen: sinon.SinonSpy;
  };

  beforeEach(() => {
    nock.disableNetConnect();
    fakeExpress = { get: sinon.spy(), listen: sinon.spy() };
  });

  jsc.property(
    "Should register aspects, hooks and start listening for webhook events",
    jsc.array(aspectArb),
    jsc.nestring,
    lcAlphaNumStringArb,
    lcAlphaNumStringArb,
    jsc.array(jsc.nestring),
    jsc.array(jsc.nestring),
    jsc.suchthat(jsc.integer, integer => integer > 0),
    (
      aspectDefs: AspectDefinition[],
      id: string,
      registryDomain: string,
      listenDomain: string,
      aspects: string[],
      optionalAspects: string[],
      defaultPort
    ) => {
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
        express: () => (fakeExpress as any) as express.Express,
        onRecordFound: record => Promise.resolve()
      };

      return sleuther(options).then(() => {
        registryScope.done();

        expect(fakeExpress.listen.calledWith(options.defaultPort)).to.be.true;
        expect(fakeExpress.get.calledWith("/hook")).to.be.true;

        return true;
      });
    }
  );

  jsc.property(
    "should properly crawl existing",
    jsc.array(jsc.nestring),
    jsc.array(jsc.nestring),
    jsc.array(recordArb),
    jsc.suchthat(jsc.integer, int => int > 0),
    (aspects, optionalAspects, records, pageSize) => {
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

      const options: SleutherOptions = {
        registry,
        host: `example.com`,
        defaultPort: 80,
        id: "id",
        aspects: aspects,
        optionalAspects: optionalAspects,
        writeAspectDefs: [],
        express: () => (fakeExpress as any) as express.Express,
        onRecordFound: sinon.spy()
      };

      return sleuther(options).then(() => {
        records.forEach((record: object) => {
          expect((options.onRecordFound as sinon.SinonSpy).calledWith(record));
        });

        return true;
      });
    }
  );

  it("should properly handle incoming webhooks", () => {});

  describe("error cases", () => {
    it("should handle bad aspect names", () => {});
    it("should handle bad hook names", () => {});
    it("should handle bad domains", () => {});
  });
});
