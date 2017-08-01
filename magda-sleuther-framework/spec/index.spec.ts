import {} from "mocha";
import { expect } from "chai";
import sleuther, { SleutherOptions } from "../src/index";
import * as sinon from "sinon";
import * as nock from "nock";
const { check } = require("mocha-testcheck");
import { gen } from "testcheck";
import {
  // Record,
  WebHook,
  AspectDefinition
} from "@magda/typescript-common/src/generated/registry/api";
import Registry from "@magda/typescript-common/src/Registry";
import * as express from "express";

const fakeSchema = {
  $schema: "http://json-schema.org/schema#",
  title:
    "Aspect describing the linked data quality of the dataset out of 5 stars as per https://www.w3.org/DesignIssues/LinkedData.html",
  type: "object",
  properties: {
    stars: {
      type: "integer",
      minimum: 0,
      maximum: 5
    }
  }
};

describe("Sleuther framework", () => {
  const registry: Registry = new Registry({
    baseUrl: "http://example.com:80/registry"
  });
  const fakeExpress = express();
  const registryScope = nock("http://example.com/registry");

  beforeEach(() => {
    nock.disableNetConnect();
    fakeExpress.listen = sinon.spy();
  });

  it(
    "x",
    check(gen.int, (x: number) => {
      expect(x).to.be.a("number");
    })
  );

  it("Should put aspect definition", function() {
    const aspect: AspectDefinition = {
      id: "blah",
      name: "blah",
      jsonSchema: fakeSchema
    };

    const hook: WebHook = {
      id: "test",
      name: "test",
      url: "http://example.com:80/hook",
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
        aspects: ["blah", "otherBlah"],
        optionalAspects: ["optionalBlah1", "optionalBlah2"],
        includeEvents: false,
        includeAspectDefinitions: false,
        dereference: true,
        includeRecords: true
      },
      lastEvent: null
    };

    registryScope.put("/aspects/blah", aspect).reply(201);
    registryScope.put("/hooks/test", hook).reply(201, {});
    registryScope
      .get(
        "/records?aspect=blah&aspect=otherBlah&optionalAspect=optionalBlah1&optionalAspect=optionalBlah2&dereference=true"
      )
      .reply(200, { records: [] });

    const options: SleutherOptions = {
      registry,
      host: "example.com",
      defaultPort: 80,
      id: "test",
      aspects: hook.config.aspects,
      optionalAspects: hook.config.optionalAspects,
      writeAspectDefs: [aspect],
      express: () => fakeExpress,
      onRecordFound: record => Promise.resolve()
    };

    return sleuther(options).then(() => registryScope.done());
  });
});
