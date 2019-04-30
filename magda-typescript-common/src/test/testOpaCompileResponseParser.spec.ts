import { expect } from "chai";
import OpaCompileResponseParser from "../OpaCompileResponseParser";
import * as testData from "./sampleOpaResponse.json";
import "mocha";

describe("OpaCompileResultParser", function() {
    it("Parse sample response with no errors", function() {
        const parser = new OpaCompileResponseParser();
        const data = parser.parse(JSON.stringify(testData));
        expect(parser.hasWarns).to.be.equal(false);
        expect(data).to.be.an("array");
    });
});
