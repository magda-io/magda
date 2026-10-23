import _ from "lodash";
import "mocha";
import { require } from "@magda/esm-utils";
import { expect } from "chai";
import OpaCompileResponseParser from "../OpaCompileResponseParser.js";
const testData = require("./sampleOpaResponses/content.json");
const testDataSimple = require("./sampleOpaResponses/simple.json");
const testDataUnconditionalTrue = require("./sampleOpaResponses/unconditionalTrue.json");
const testDataUnconditionalTrueWithDefaultRule = require("./sampleOpaResponses/unconditionalTrueWithDefaultRule.json");
const testDataEsriPolicyWithDefaultRule = require("./sampleOpaResponses/withDefaultRule.json");
const testDataUnconditionalNotMacthed = require("./sampleOpaResponses/unconditionalNotMacthed.json");
const testDataUnconditionalNotMacthedWithExtraRefs = require("./sampleOpaResponses/unconditionalNotMacthedWithExtraRefs.json");
const testDataUnconditionalFalseSimple = require("./sampleOpaResponses/unconditionalFalseSimple.json");
const testDataUnconditionalTrueSimple = require("./sampleOpaResponses/unconditionalTrueSimple.json");
const testDataDatasetPermissionWithOrgUnitConstraint = require("./sampleOpaResponses/datasetPermissionWithOrgUnitConstraint.json");
const testDataSingleTermAspectRef = require("./sampleOpaResponses/singleTermAspectRef.json");
const testExtraLargeResponse = require("./sampleOpaResponses/extraLargeResponse.json");
const testDataAgentSkillBuiltinCalls = require("./sampleUntranslatableOpaResponses/agentSkillBuiltinCalls.json");

describe("Test extra large opa response", () => {
    it("should process extra large opa response in timely manager", function () {
        // this test case should be completed in less than 3000ms
        // should be around 600ms locally but we set for 3000ms in case it get slower in CI (we use highmem instance)
        this.timeout(3000);
        console.time("process-extra-large-opa-response-time");
        const parser = new OpaCompileResponseParser();
        const data = parser.parse(JSON.stringify(testExtraLargeResponse));
        console.log(
            "no.of original rules vs filtered rules: ",
            parser.originalRules.length,
            parser.rules.length
        );
        parser.evaluate();
        //console.log(parser.evaluateAsHumanReadableString());
        expect(parser.hasWarns).to.be.equal(false);
        expect(data).to.be.an("array");
        console.timeEnd("process-extra-large-opa-response-time");
    });
});

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
            '"5447fcb1-74ec-451c-b6ef-007aa736a346" = input.object.dataset.accessControl.orgUnitId'
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
            `( input.object.dataset.publishingState = "published" AND \n"5447fcb1-74ec-451c-b6ef-007aa736a346" = input.object.dataset.accessControl.orgUnitId )\nOR\n( input.object.dataset.publishingState = "published" AND \n"b749759e-6e6a-44c0-87ab-4590744187cf" = input.object.dataset.accessControl.orgUnitId )`
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

/**
 * Residual rules produced by OPA (v0.37.2) for `object/record/update` with unknown `input.object.record`
 * for a user with Agent Skill owner permissions. The Agent Skill write rules call built-in functions
 * (e.g. `regex.match`) on the unknown record, which can't be translated (e.g. to SQL).
 * The parser must fail loudly when residual rules are needed, rather than silently drop or mistranslate those rules,
 * so policy authors find out and choose a different evaluation path (e.g. full evaluation per record).
 * See https://github.com/magda-io/magda/issues/3869
 */
describe("Test OpaCompileResultParser with built-in function calls on unknowns", function () {
    // the same response plus a rule that allows the operation on any record
    function withUnconditionalRule(data: any) {
        const newData = _.cloneDeep(data);
        const recordPackage = newData.result.support.find((p: any) =>
            p.package.path.find((part: any) => part.value === "record")
        );
        recordPackage.rules.push({
            head: { name: "allow", value: { type: "boolean", value: true } },
            body: [{ index: 0, terms: { type: "boolean", value: true } }]
        });
        return newData;
    }

    it("should throw an error when residual rules are needed", function () {
        const parser = new OpaCompileResponseParser();
        parser.parse(JSON.stringify(testDataAgentSkillBuiltinCalls));
        expect(() => parser.evaluate()).to.throw(
            /Residual rules contain a rego expression that can't be translated .*: regex\.match "\^\[0-9a-f\]/
        );
        expect(() => parser.evaluateAsHumanReadableString()).to.throw(
            /can't be translated/
        );
    });

    it("should evaluate unconditionally as not unconditional, without residual rules", function () {
        const parser = new OpaCompileResponseParser();
        parser.parse(JSON.stringify(testDataAgentSkillBuiltinCalls));
        const result = parser.evaluateUnconditionally();
        expect(result.isCompleteEvaluated).to.be.equal(false);
        expect(result.residualRules).to.be.undefined;
    });

    it("should evaluate to unconditional true when another rule allows the operation unconditionally", function () {
        const data = withUnconditionalRule(testDataAgentSkillBuiltinCalls);

        let parser = new OpaCompileResponseParser();
        parser.parse(JSON.stringify(data));
        let result = parser.evaluateUnconditionally();
        expect(result.isCompleteEvaluated).to.be.equal(true);
        expect(result.value).to.be.equal(true);

        // no residual rules are needed either
        parser = new OpaCompileResponseParser();
        parser.parse(JSON.stringify(data));
        result = parser.evaluate();
        expect(result.isCompleteEvaluated).to.be.equal(true);
        expect(result.value).to.be.equal(true);
    });
});
