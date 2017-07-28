import {} from "jasmine";
import sleuther, { SleutherOptions } from "../src/index";
import {
  // Record,
  // WebHook,
  // WebHookConfig,
  AspectDefinition
} from "@magda/typescript-common/dist/generated/registry/api";
import Registry from "@magda/typescript-common/dist/Registry";
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
  const registry: Registry = new Registry({ baseUrl: "" });
  const fakeExpress = express();

  beforeEach(() => {
    spyOn(fakeExpress, "listen").and.stub();
  });

  it("Should put aspect definition", function() {
    const aspect: AspectDefinition = {
      id: "blah",
      name: "blah",
      jsonSchema: fakeSchema
    };

    const options: SleutherOptions = {
      registry,
      host: "example.com",
      defaultPort: 80,
      id: "test",
      aspects: [],
      optionalAspects: [],
      writeAspectDefs: [aspect],
      express: () => fakeExpress,
      onRecordFound: record => Promise.resolve()
    };

    spyOn(registry, "putAspectDefinition").and.callFake(
      (aspect: any) => aspect
    );

    sleuther(options);

    expect(registry.putAspectDefinition).toHaveBeenCalled();
  });
});
