import { expect } from "chai";
import OpaCompileResponseParser from "../OpaCompileResponseParser";
import testData from "./sampleOpaResponses/content.json";
import testDataSimple from "./sampleOpaResponses/simple.json";
import testDataUnconditionalTrue from "./sampleOpaResponses/unconditionalTrue.json";
import testDataUnconditionalTrueWithDefaultRule from "./sampleOpaResponses/unconditionalTrueWithDefaultRule.json";
import testDataEsriPolicyWithDefaultRule from "./sampleOpaResponses/withDefaultRule.json";
import testDataUnconditionalNotMacthed from "./sampleOpaResponses/unconditionalNotMacthed.json";
import testDataUnconditionalNotMacthedWithExtraRefs from "./sampleOpaResponses/unconditionalNotMacthedWithExtraRefs.json";
import testDataUnconditionalFalseSimple from "./sampleOpaResponses/unconditionalFalseSimple.json";
import testDataUnconditionalTrueSimple from "./sampleOpaResponses/unconditionalTrueSimple.json";
import testDataDatasetPermissionWithOrgUnitConstraint from "./sampleOpaResponses/datasetPermissionWithOrgUnitConstraint.json";
import testDataSingleTermAspectRef from "./sampleOpaResponses/singleTermAspectRef.json";
import "mocha";

/**
 * Although equivalent, depends on how you write your policy,
 * the result could contains more or less redundant expression / rules (e.g. TRUE && TRUE )
 * Things could trigger more redundant expression are:
 * - reference another rule without evaluate the result directly
 *   - e.g. `isValidURL` will likely produce more redundant expression than `isValidURL == true`
 * - use NOT
 * OpaCompileResultParser will dry the result to its most concise form so we don't need to worry about the difference
 */
describe("Test OpaCompileResultParser with complex response", function () {
    it("Parse sample response with no errors", function () {
        const parser = new OpaCompileResponseParser();
        const data = parser.parse(JSON.stringify(testData));
        expect(parser.hasWarns).to.be.equal(false);
        expect(data).to.be.an("array");
    });

    it("Should evalute rule `allowRead` from parse result correctly", function () {
        const parser = new OpaCompileResponseParser();
        parser.parse(JSON.stringify(testData));
        const result = parser.evaluate();
        expect(parser.hasWarns).to.be.equal(false);
        expect(result.isCompleteEvaluated).to.be.equal(false);
        expect(result.residualRules).to.be.an("array");
        expect(result.residualRules.length).to.be.equal(1);
        expect(result.residualRules[0].isCompleteEvaluated).to.be.equal(false);
        expect(result.residualRules[0].expressions.length).to.be.equal(1);
        expect(result.residualRules[0].expressions[0].terms.length).to.be.equal(
            3
        );
        expect(
            result.residualRules[0].expressions[0].toHumanReadableString()
        ).to.be.equal('input.object.content.id = "header/navigation/datasets"');
    });

    it("Should generate correct human readable string", function () {
        const parser = new OpaCompileResponseParser();
        parser.parse(JSON.stringify(testData));
        const result = parser.evaluateAsHumanReadableString();
        expect(parser.hasWarns).to.be.equal(false);
        expect(result).to.be.equal(
            'input.object.content.id = "header/navigation/datasets"'
        );
    });
});

describe("Test OpaCompileResultParser with simple response", function () {
    it("Parse sample response with no errors", function () {
        const parser = new OpaCompileResponseParser();
        const data = parser.parse(JSON.stringify(testDataSimple));
        expect(parser.hasWarns).to.be.equal(false);
        expect(data).to.be.an("array");
    });

    it("Should evalute rule `allowRead` from parse result correctly", function () {
        const parser = new OpaCompileResponseParser();
        parser.parse(JSON.stringify(testDataSimple));
        const result = parser.evaluate();
        expect(parser.hasWarns).to.be.equal(false);
        expect(result.isCompleteEvaluated).to.be.equal(false);
        expect(result.residualRules).to.be.an("array");
        expect(result.residualRules.length).to.be.equal(1);
        expect(result.residualRules[0].isCompleteEvaluated).to.be.equal(false);
        expect(result.residualRules[0].expressions.length).to.be.equal(1);
        expect(result.residualRules[0].expressions[0].terms.length).to.be.equal(
            3
        );
        expect(
            result.residualRules[0].expressions[0].toHumanReadableString()
        ).to.be.equal('input.object.content.id = "header/navigation/datasets"');
    });

    it("Should generate correct human readable string", function () {
        const parser = new OpaCompileResponseParser();
        parser.parse(JSON.stringify(testDataSimple));
        const result = parser.evaluateAsHumanReadableString();
        expect(parser.hasWarns).to.be.equal(false);
        expect(result).to.be.equal(
            'input.object.content.id = "header/navigation/datasets"'
        );
    });
});

describe("Test OpaCompileResultParser with unconditional true response", function () {
    it("Parse sample response with no errors", function () {
        const parser = new OpaCompileResponseParser();
        const data = parser.parse(JSON.stringify(testDataUnconditionalTrue));
        expect(parser.hasWarns).to.be.equal(false);
        expect(data).to.be.an("array");
    });

    it("Should evalute query from parse result correctly", function () {
        const parser = new OpaCompileResponseParser();
        parser.parse(JSON.stringify(testDataUnconditionalTrue));
        const result = parser.evaluate();
        expect(parser.hasWarns).to.be.equal(false);
        expect(result.isCompleteEvaluated).to.be.equal(true);
        expect(result.value).to.be.equal(true);
    });

    it("Should generate correct human readable string", function () {
        const parser = new OpaCompileResponseParser();
        parser.parse(JSON.stringify(testDataUnconditionalTrue));
        const result = parser.evaluateAsHumanReadableString();
        expect(parser.hasWarns).to.be.equal(false);
        expect(result).to.be.equal("true");
    });
});

describe("Test OpaCompileResultParser with unconditional true response (policy contains default rules)", function () {
    it("Parse sample response with no errors", function () {
        const parser = new OpaCompileResponseParser();
        const data = parser.parse(
            JSON.stringify(testDataUnconditionalTrueWithDefaultRule)
        );
        expect(parser.hasWarns).to.be.equal(false);
        expect(data).to.be.an("array");
    });

    it("Should evalute query from parse result correctly", function () {
        const parser = new OpaCompileResponseParser();
        parser.parse(JSON.stringify(testDataUnconditionalTrueWithDefaultRule));
        const result = parser.evaluate();
        expect(parser.hasWarns).to.be.equal(false);
        expect(result.isCompleteEvaluated).to.be.equal(true);
        expect(result.value).to.be.equal(true);
    });

    it("Should generate correct human readable string", function () {
        const parser = new OpaCompileResponseParser();
        parser.parse(JSON.stringify(testDataUnconditionalTrueWithDefaultRule));
        const result = parser.evaluateAsHumanReadableString();
        expect(parser.hasWarns).to.be.equal(false);
        expect(result).to.be.equal("true");
    });
});

describe("Test OpaCompileResultParser with esri policy that contains default rules", function () {
    it("Parse sample response with no errors", function () {
        const parser = new OpaCompileResponseParser();
        const data = parser.parse(
            JSON.stringify(testDataEsriPolicyWithDefaultRule)
        );
        expect(parser.hasWarns).to.be.equal(false);
        expect(data).to.be.an("array");
    });

    it("Should evalute query from parse result correctly", function () {
        const parser = new OpaCompileResponseParser();
        parser.parse(JSON.stringify(testDataEsriPolicyWithDefaultRule));
        const result = parser.evaluate();
        expect(parser.hasWarns).to.be.equal(false);
        expect(result.isCompleteEvaluated).to.be.equal(true);
        expect(result.value).to.be.equal(true);
    });

    it("Should generate correct human readable string", function () {
        const parser = new OpaCompileResponseParser();
        parser.parse(JSON.stringify(testDataEsriPolicyWithDefaultRule));
        const result = parser.evaluateAsHumanReadableString();
        expect(parser.hasWarns).to.be.equal(false);
        expect(result).to.be.equal("true");
    });
});

describe("Test OpaCompileResultParser with unconditional not matched (no rule in query is matched) response", function () {
    it("Parse sample response with no errors", function () {
        const parser = new OpaCompileResponseParser();
        const data = parser.parse(
            JSON.stringify(testDataUnconditionalNotMacthed)
        );
        expect(parser.hasWarns).to.be.equal(false);
        expect(data).to.be.an("array");
    });

    it("Should evalute query from parse result correctly", function () {
        const parser = new OpaCompileResponseParser();
        parser.parse(JSON.stringify(testDataUnconditionalNotMacthed));
        const result = parser.evaluate();
        expect(parser.hasWarns).to.be.equal(false);
        expect(result.isCompleteEvaluated).to.be.equal(true);
        expect(result.value).to.be.undefined;
    });

    it("Should generate correct human readable string", function () {
        const parser = new OpaCompileResponseParser();
        parser.parse(JSON.stringify(testDataUnconditionalNotMacthed));
        const result = parser.evaluateAsHumanReadableString();
        expect(parser.hasWarns).to.be.equal(false);
        expect(result).to.be.equal("undefined");
    });
});

describe("Test OpaCompileResultParser with unconditional not matched (no rule in query is matched) with extra refs response", function () {
    it("Parse sample response with no errors", function () {
        const parser = new OpaCompileResponseParser();
        const data = parser.parse(
            JSON.stringify(testDataUnconditionalNotMacthedWithExtraRefs)
        );
        expect(parser.hasWarns).to.be.equal(false);
        expect(data).to.be.an("array");
    });

    it("Should evalute query from parse result correctly", function () {
        const parser = new OpaCompileResponseParser();
        parser.parse(
            JSON.stringify(testDataUnconditionalNotMacthedWithExtraRefs)
        );
        const result = parser.evaluate();
        expect(parser.hasWarns).to.be.equal(false);
        expect(result.isCompleteEvaluated).to.be.equal(true);
        expect(result.value).to.be.undefined;
    });

    it("Should generate correct human readable string", function () {
        const parser = new OpaCompileResponseParser();
        parser.parse(
            JSON.stringify(testDataUnconditionalNotMacthedWithExtraRefs)
        );
        const result = parser.evaluateAsHumanReadableString();
        expect(parser.hasWarns).to.be.equal(false);
        expect(result).to.be.equal("undefined");
    });
});

describe("Test OpaCompileResultParser with unconditional true (simple response)", function () {
    it("Parse sample response with no errors", function () {
        const parser = new OpaCompileResponseParser();
        const data = parser.parse(
            JSON.stringify(testDataUnconditionalTrueSimple)
        );
        expect(parser.hasWarns).to.be.equal(false);
        expect(data).to.be.an("array");
    });

    it("Should evalute query from parse result correctly", function () {
        const parser = new OpaCompileResponseParser();
        parser.parse(JSON.stringify(testDataUnconditionalTrueSimple));
        const result = parser.evaluate();
        expect(parser.hasWarns).to.be.equal(false);
        expect(result.isCompleteEvaluated).to.be.equal(true);
        expect(result.value).to.be.equal(true);
    });

    it("Should generate correct human readable string", function () {
        const parser = new OpaCompileResponseParser();
        parser.parse(JSON.stringify(testDataUnconditionalTrueSimple));
        const result = parser.evaluateAsHumanReadableString();
        expect(parser.hasWarns).to.be.equal(false);
        expect(result).to.be.equal("true");
    });
});

describe("Test OpaCompileResultParser with unconditional false (simple response)", function () {
    it("Parse sample response with no errors", function () {
        const parser = new OpaCompileResponseParser();
        const data = parser.parse(
            JSON.stringify(testDataUnconditionalFalseSimple)
        );
        expect(parser.hasWarns).to.be.equal(false);
        expect(data).to.be.an("array");
    });

    it("Should evalute query from parse result correctly", function () {
        const parser = new OpaCompileResponseParser();
        parser.parse(JSON.stringify(testDataUnconditionalFalseSimple));
        const result = parser.evaluate();
        expect(parser.hasWarns).to.be.equal(false);
        expect(result.isCompleteEvaluated).to.be.equal(true);
        expect(result.value).to.be.equal(false);
    });

    it("Should generate correct human readable string", function () {
        const parser = new OpaCompileResponseParser();
        parser.parse(JSON.stringify(testDataUnconditionalFalseSimple));
        const result = parser.evaluateAsHumanReadableString();
        expect(parser.hasWarns).to.be.equal(false);
        expect(result).to.be.equal("false");
    });
});

describe("Test OpaCompileResultParser with datasetPermissionWithOrgUnitConstraint", function () {
    it("Parse sample response with no errors", function () {
        const parser = new OpaCompileResponseParser();
        const data = parser.parse(
            JSON.stringify(testDataDatasetPermissionWithOrgUnitConstraint)
        );
        expect(parser.hasWarns).to.be.equal(false);
        expect(data).to.be.an("array");
    });

    it("Should evalute query from parse result correctly", function () {
        const parser = new OpaCompileResponseParser();
        parser.parse(
            JSON.stringify(testDataDatasetPermissionWithOrgUnitConstraint)
        );
        const result = parser.evaluate();
        expect(parser.hasWarns).to.be.equal(false);
        expect(result.isCompleteEvaluated).to.be.equal(false);
        expect(result.residualRules).to.be.an("array");
        expect(result.residualRules.length).to.be.equal(2);
        expect(result.residualRules[0].isCompleteEvaluated).to.be.equal(false);
        expect(result.residualRules[0].expressions.length).to.be.equal(2);
        expect(result.residualRules[0].expressions[0].terms.length).to.be.equal(
            3
        );
        expect(
            result.residualRules[0].expressions[0].toHumanReadableString()
        ).to.be.equal('input.object.dataset.publishingState = "published"');
        expect(result.residualRules[0].expressions[1].terms.length).to.be.equal(
            3
        );
        expect(
            result.residualRules[0].expressions[1].toHumanReadableString()
        ).to.be.equal(
            '"5447fcb1-74ec-451c-b6ef-007aa736a346" = input.object.dataset.accessControl.orgUnitOwnerId'
        );
    });

    it("Should generate correct human readable string", function () {
        const parser = new OpaCompileResponseParser();
        parser.parse(
            JSON.stringify(testDataDatasetPermissionWithOrgUnitConstraint)
        );
        const result = parser.evaluateAsHumanReadableString();
        expect(parser.hasWarns).to.be.equal(false);
        expect(result).to.be.equal(
            `( input.object.dataset.publishingState = "published" AND \n"5447fcb1-74ec-451c-b6ef-007aa736a346" = input.object.dataset.accessControl.orgUnitOwnerId )\nOR\n( input.object.dataset.publishingState = "published" AND \n"b749759e-6e6a-44c0-87ab-4590744187cf" = input.object.dataset.accessControl.orgUnitOwnerId )`
        );
    });
});

describe("Test OpaCompileResultParser with testDataSingleTermAspectRef", function () {
    it("Parse sample response with no errors", function () {
        const parser = new OpaCompileResponseParser();
        const data = parser.parse(JSON.stringify(testDataSingleTermAspectRef));
        expect(parser.hasWarns).to.be.equal(false);
        expect(data).to.be.an("array");
    });

    it("Should evalute query from parse result and output concise format correctly", function () {
        const parser = new OpaCompileResponseParser();
        parser.parse(JSON.stringify(testDataSingleTermAspectRef));
        const result = parser.evaluate();
        expect(parser.hasWarns).to.be.equal(false);
        expect(result.isCompleteEvaluated).to.be.equal(false);
        expect(result.residualRules).to.be.an("array");
        expect(result.residualRules.length).to.be.equal(1);
        expect(result.residualRules[0].isCompleteEvaluated).to.be.equal(false);
        const conciseRules = result.residualRules.map((item) =>
            item.toConciseData()
        );
        expect(conciseRules[0].expressions.length).to.be.equal(2);
        const exp1 = conciseRules[0].expressions[0];
        expect(exp1.negated).to.be.equal(false);
        expect(exp1.operator).to.be.null;
        expect(exp1.operands.length).to.equal(1);
        expect(exp1.operands[0]).to.deep.equal({
            isRef: true,
            value: "input.object.record.dcat-dataset-strings"
        });

        const exp2 = conciseRules[0].expressions[1];
        expect(exp2.negated).to.be.equal(false);
        expect(exp2.operator).to.be.equal("=");
        expect(exp2.operands.length).to.equal(2);
        expect(exp2.operands[0]).to.deep.equal({
            isRef: true,
            value: "input.object.record.publishing.state"
        });
        expect(exp2.operands[1]).to.deep.equal({
            isRef: false,
            value: "published"
        });
    });

    it("Should generate correct human readable string", function () {
        const parser = new OpaCompileResponseParser();
        parser.parse(JSON.stringify(testDataSingleTermAspectRef));
        const result = parser.evaluateAsHumanReadableString();
        expect(parser.hasWarns).to.be.equal(false);
        expect(result).to.be.equal(
            `input.object.record.dcat-dataset-strings AND \ninput.object.record.publishing.state = "published"`
        );
    });
});
