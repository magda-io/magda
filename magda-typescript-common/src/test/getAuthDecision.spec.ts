import { expect } from "chai";
import getAuthDecision from "../opa/getAuthDecision";
import testDataUnconditionalTrue from "./sampleOpaResponseUnconditionalTrue.json";
import "mocha";

/* 
    getAuthDecision only support limited use case of OPA response AST.
    Thus, we will not test other response sample as an error will be thrown (due to lack the support of resolving rule reference).
    This test case is to ensure the unconditional true case can be handled for #2956
    We should switch back to OpaCompileResponseParser to support more generic OPA AST
*/
describe("Test OpaCompileResultParser with unconditional true response", function () {
    it("Should evalute query from parse result correctly", function () {
        const result = getAuthDecision(testDataUnconditionalTrue as any);
        expect(result).to.be.equal(true);
    });
});
