import * as _ from "lodash";

type RegoValue = string | boolean | number | Array<any> | Object;

interface RegoRuleOptions {
    name: string;
    fullName: string;
    isDefault: boolean;
    value: RegoValue;
    expressions: RegoExp[];
    isCompleteEvaluated?: boolean;
    parser: OpaCompileResponseParser;
}

class RegoRule {
    public name: string;
    public fullName: string;
    public isDefault: boolean;
    public value: RegoValue;
    public expressions: RegoExp[];
    // --- whether this rule is matched
    public isMatched: boolean;
    public isCompleteEvaluated: boolean;

    private parser: OpaCompileResponseParser;

    constructor(options: RegoRuleOptions) {
        this.isCompleteEvaluated = false;
        this.name = _.isString(options.name) ? options.name : "";
        this.fullName = _.isString(options.fullName) ? options.fullName : "";
        this.isDefault = _.isBoolean(options.isDefault)
            ? options.isDefault
            : false;
        this.value = _.isUndefined(options.value) ? true : options.value;
        this.expressions = _.isArray(options.expressions)
            ? options.expressions
            : [];
        this.isCompleteEvaluated = _.isBoolean(options.isCompleteEvaluated)
            ? options.isCompleteEvaluated
            : false;
        this.parser = options.parser;

        if (this.name === "") {
            throw new Error("Rule name can't be empty");
        }

        if (this.fullName === "") {
            throw new Error("Rule fullName can't be empty");
        }

        if (!(this.parser instanceof OpaCompileResponseParser)) {
            throw new Error("Require parser parameter to create a RegoRule");
        }
    }

    clone(): RegoRule {
        const regoRule = new RegoRule({
            name: this.name,
            fullName: this.fullName,
            isDefault: this.isDefault,
            value: this.value,
            isCompleteEvaluated: this.isCompleteEvaluated,
            expressions: this.expressions.map(e => e.clone()),
            parser: this.parser
        });
        regoRule.isMatched = this.isMatched;
        return regoRule;
    }

    evaluate() {
        this.expressions = this.expressions.map(exp => exp.evaluate());
        const falseExpression = this.expressions.find(
            exp => exp.isMatch() === false
        );
        if (!_.isUndefined(falseExpression)) {
            // --- rule expressions are always evaluated in the context of AND
            // --- any false expression will make the rule not match
            this.isCompleteEvaluated = true;
            this.isMatched = false;
        } else {
            // --- filter out all expressions are evaluated
            // --- note any non-false value will considered as a match (true) i.e. 0 is equivalent to true
            const idx = this.expressions.findIndex(
                exp => !exp.isCompleteEvaluated
            );
            if (idx === -1) {
                this.isCompleteEvaluated = true;
                this.isMatched = true;
            } else {
                // --- further dry the rule if the rule has unsolved exps
                // --- if a exp is matched (i.e. true) it can be strip out as true AND xxxx = xxxx
                this.expressions = this.expressions.filter(
                    exp => exp.isMatch() !== true
                );
            }
        }
        return this;
    }

    static parseFromData(
        r: any,
        packageName: string,
        parser: OpaCompileResponseParser
    ): RegoRule {
        const ruleName = r.head && r.head.name ? r.head.name : "";
        const ruleFullName = [packageName, ruleName].join(".");
        const ruleIsDefault = r.default === true;
        const ruleValue =
            r.head && r.head.value && !_.isUndefined(r.head.value.value)
                ? r.head.value.value
                : true;
        const ruleOptions: RegoRuleOptions = {
            name: ruleName,
            fullName: ruleFullName,
            isDefault: ruleIsDefault,
            value: ruleValue,
            expressions: RegoRule.createExpressionsFromRuleBodyData(
                r.body,
                parser
            ),
            parser
        };
        const regoRule = new RegoRule(ruleOptions);
        regoRule.evaluate();
        return regoRule;
    }

    static createExpressionsFromRuleBodyData(
        data: any,
        parser: OpaCompileResponseParser
    ): RegoExp[] {
        if (!_.isArray(data) || !data.length) {
            throw new Error(`Encountered empty rule body.`);
        }
        return data.map(expData => RegoExp.parseFromData(expData, parser));
    }
}

interface RegoRefPart {
    type: string;
    value: string;
}

const RegoOperators: {
    [k: string]: string;
} = {
    eq: "=", // --- eq & equal are different in rego but no difference for value evluation.
    equal: "=",
    neq: "!=",
    lt: "<",
    gt: ">",
    lte: "<=",
    gte: ">="
};

type RegoTermValue = RegoRef | RegoValue;

interface RegoTerm {
    type: string;
    value: RegoTermValue;
}

class RegoTerm {
    public type: string;
    public value: RegoTermValue;
    private parser: OpaCompileResponseParser;

    constructor(
        type: string,
        value: RegoTermValue,
        parser: OpaCompileResponseParser
    ) {
        this.type = type;
        this.value = value;
        this.parser = parser;
    }

    clone() {
        return new RegoTerm(this.type, this.value, this.parser);
    }

    asString() {
        if (this.value instanceof RegoRef) return this.value.fullRefString();
        else return this.value;
    }

    isRef(): boolean {
        if (this.value instanceof RegoRef) return true;
        return false;
    }

    fullRefString(): string {
        if (this.value instanceof RegoRef) {
            return this.value.fullRefString();
        } else {
            throw new Error("Tried to call `fullRefString` on non Ref term.");
        }
    }

    refString(): string {
        if (this.value instanceof RegoRef) {
            return this.value.refString();
        } else {
            throw new Error("Tried to call `refString` on non Ref term.");
        }
    }

    asOperator(): string {
        if (this.value instanceof RegoRef) {
            return this.value.asOperator();
        } else {
            throw new Error("Tried to call `asOperator` on non Ref term.");
        }
    }

    isOperator(): boolean {
        if (this.value instanceof RegoRef) {
            return this.value.isOperator();
        } else {
            return false;
        }
    }

    getValue(): RegoValue {
        if (!this.isRef()) {
            return this.value;
        } else {
            if (this.isOperator()) {
                return undefined;
            } else {
                const fullName = this.fullRefString();
                const result = this.parser.completeRuleResults[fullName];
                if (_.isUndefined(result)) return undefined;
                return result.value;
            }
        }
    }

    static parseFromData(
        data: any,
        parser: OpaCompileResponseParser
    ): RegoTerm {
        if (data.type === "ref") {
            return new RegoTerm(data.type, RegoRef.parseFromData(data), parser);
        } else {
            return new RegoTerm(data.type, data.value, parser);
        }
    }
}

class RegoExp {
    public terms: RegoTerm[];
    public isNegated: boolean;
    public isCompleteEvaluated: boolean = false;
    public value: RegoValue = null;
    private parser: OpaCompileResponseParser;

    constructor(
        terms: RegoTerm[],
        isNegated: boolean = false,
        isCompleteEvaluated: boolean = false,
        value: RegoValue = null,
        parser: OpaCompileResponseParser
    ) {
        this.terms = terms;
        this.isNegated = isNegated;
        this.isCompleteEvaluated = isCompleteEvaluated;
        this.value = value;
        this.parser = parser;
    }

    clone(): RegoExp {
        const regoExp = new RegoExp(
            this.terms.map(t => t.clone()),
            this.isNegated,
            this.isCompleteEvaluated,
            this.value,
            this.parser
        );
        return regoExp;
    }

    termsAsString() {
        return this.terms.map(t => t.asString());
    }

    getValue() {
        this.evaluate();
        if (!this.isCompleteEvaluated) return undefined;
        if (this.isNegated) {
            return this.value === false ? true : false;
        } else {
            // --- undefined is a common value in Rego similar to false
            // --- we set to false here to tell the difference between
            // --- real undefined (not full resolved) and undefined value
            if (_.isUndefined(this.value)) return false;
            else return this.value;
        }
    }

    isMatch() {
        const value = this.getValue();
        if (_.isUndefined(value)) {
            return undefined;
        } else {
            if (value === false || _.isUndefined(value)) return false;
            // --- 0 is a match
            return true;
        }
    }

    evaluate() {
        if (this.terms.length === 0) {
            // --- exp should be considered as matched (true)
            // --- unless isNegated is true
            // --- will try to normalise isNegated here
            this.isCompleteEvaluated = true;
            this.value = this.isNegated ? false : true;
            this.isNegated = false;
        }
        if (this.terms.length === 1) {
            const term = this.terms[0];
            const value = term.getValue();
            if (_.isUndefined(value)) return this;

            this.value = value;
            this.isCompleteEvaluated = true;
            return this;
        } else if (this.terms.length === 3) {
            // --- 3 terms expression e.g. true == true or x >= 3
            // --- we only evalute some redundant expression e.g. true == true or false != true
            const operands: RegoTermValue[] = [];
            let operator = null;
            this.terms.forEach(t => {
                if (t.isOperator()) {
                    operator = t.asOperator();
                } else {
                    operands.push(t.getValue());
                }
            });
            if (!operator) {
                throw new Error(
                    `Invalid 3 terms rego expression, can't locate operator: ${this.termsAsString()}`
                );
            }
            if (operands.length !== 2) {
                throw new Error(
                    `Invalid 3 terms rego expression, the number of operands should be 2: ${this.termsAsString()}`
                );
            }
            if (operands.findIndex(op => _.isUndefined(op)) !== -1) {
                // --- this expression involve unknown no need to evalute
                return this;
            } else {
                let value = null;
                switch (operator) {
                    case "=":
                        value = operands[0] === operands[1];
                        break;
                    case ">":
                        value = operands[0] > operands[1];
                        break;
                    case "<":
                        value = operands[0] < operands[1];
                        break;
                    case ">=":
                        value = operands[0] >= operands[1];
                        break;
                    case "<=":
                        value = operands[0] <= operands[1];
                        break;
                    case "!=":
                        value = operands[0] != operands[1];
                        break;
                    default:
                        throw new Error(
                            `Invalid 3 terms rego expression, Unknown operator "${operator}": ${this.termsAsString()}`
                        );
                }
                this.isCompleteEvaluated = true;
                this.value = value;
                return this;
            }
        }
        // --- so far there is no 2 terms expression e.g. ! x
        // --- builtin function should never be included in residual rule
        // --- as we won't apply them on unknowns
        return this;
    }

    static parseFromData(
        expData: any,
        parser: OpaCompileResponseParser
    ): RegoExp {
        const isNegated = expData.negated === true;
        if (_.isEmpty(expData.terms)) {
            if (isNegated) throw new Error("Invalid negated empty term!");
            return new RegoExp([], isNegated, false, null, parser);
        }

        let termsData: any[] = [];
        if (_.isArray(expData.terms)) {
            termsData = expData.terms;
        } else {
            termsData.push(expData.terms);
        }

        const terms: RegoTerm[] = termsData.map((termData: any) =>
            RegoTerm.parseFromData(termData, parser)
        );

        const exp = new RegoExp(terms, isNegated, false, null, parser);
        exp.evaluate();
        return exp;
    }
}

class RegoRef {
    public parts: RegoRefPart[];

    constructor(parts: RegoRefPart[]) {
        this.parts = parts;
    }

    clone(): RegoRef {
        return new RegoRef(this.parts.map(p => ({ ...p })));
    }

    static parseFromData(data: any): RegoRef {
        if (data.type === "ref") {
            return new RegoRef(data.value as RegoRefPart[]);
        } else {
            return null;
        }
    }

    static convertToFullRefString(parts: RegoRefPart[]): string {
        return new RegoRef(parts).fullRefString();
    }

    fullRefString(): string {
        let isFirstPart = true;
        return this.parts
            .map(part => {
                let partStr = "";
                if (isFirstPart) {
                    partStr = part.value;
                } else {
                    if (part.type == "var") {
                        // --- it's a collection lookup
                        // --- var name doesn't matter
                        partStr = "[_]";
                    } else {
                        partStr = part.value;
                    }
                }
                if (isFirstPart) isFirstPart = false;
                return partStr;
                //--- a.[_].[_] should be a[_][_]
            })
            .join(".")
            .replace(".[", "[");
    }

    refString(): string {
        return this.fullRefString().replace("\\[_\\]$", "");
    }

    isOperator(): boolean {
        return Object.keys(RegoOperators).indexOf(this.fullRefString()) !== -1;
    }

    // --- the first var type won't count as collection lookup
    hasCollectionLookup(): boolean {
        if (this.parts.length <= 1) return false;
        else return this.parts.findIndex(part => part.type === "var") >= 1;
    }

    // -- simple collection only contains 1 level lookup
    // -- we don't need Nested Query to handle it
    isSimpleCollectionLookup(): boolean {
        if (this.parts.length <= 1) return false;
        else {
            return (
                this.parts.findIndex(part => part.type === "var") ===
                this.parts.length - 1
            );
        }
    }

    asOperator(): string {
        if (this.isOperator()) return RegoOperators[this.fullRefString()];
        else return null;
    }
}

interface CompleteRuleResult {
    fullName: string;
    name: string;
    value: RegoValue;
    residualRules?: RegoRule[];
}

export default class OpaCompileResponseParser {
    public hasWarns: boolean = false;
    public warns: string[] = [];

    private data: any = null;
    public completeRules: RegoRule[] = [];
    public rules: RegoRule[] = [];

    public completeRuleResults: {
        [fullName: string]: CompleteRuleResult;
    } = {};

    constructor() {}

    parse(json: string): RegoRule[] {
        this.data = JSON.parse(json);
        if (!this.data.result) {
            // --- mean no rule matched
            return [];
        }
        this.data = this.data.result;
        if (!_.isArray(this.data.support) || !this.data.support.length) {
            // --- mean no rule matched
            return [];
        }
        const packages: any[] = this.data.support;
        packages.forEach(p => {
            if (!_.isArray(p.rules) || !p.rules.length) return;
            const packageName =
                p.package && _.isArray(p.package.path)
                    ? RegoRef.convertToFullRefString(p.package.path)
                    : "";

            const rules: any[] = p.rules;
            rules.forEach(r => {
                const regoRule = RegoRule.parseFromData(r, packageName, this);
                this.completeRules.push(regoRule);
                // --- only save matched rules
                if (!regoRule.isCompleteEvaluated) {
                    this.rules.push(regoRule);
                } else {
                    if (regoRule.isMatched) {
                        this.rules.push(regoRule);
                    }
                }
            });
        });
        this.calculateCompleteRuleResult();
        this.reduceDependencies();
        return this.rules;
    }

    /**
     * Tried to merge rules outcome so that the ref value can be established easier
     * After this step, any rules doesn't involve unknown should be merged to one value
     * This will help to generate more concise query later
     */
    calculateCompleteRuleResult() {
        const fullNames = this.rules.map(r => r.fullName);
        fullNames.forEach(fullName => {
            const rules = this.rules.filter(r => r.fullName === fullName);
            const nonCompletedRules = rules.filter(r => !r.isCompleteEvaluated);
            const completedRules = rules.filter(r => r.isCompleteEvaluated);
            const defaultRules = completedRules.filter(r => r.isDefault);
            const nonDefaultRules = completedRules.filter(r => !r.isDefault);
            if (nonDefaultRules.length) {
                // --- if a non default complete eveluated rules exist
                // --- it will be the final outcome
                this.completeRuleResults[
                    fullName
                ] = this.createCompleteRuleResult(nonDefaultRules[0]);
                return;
            }
            if (!nonCompletedRules.length) {
                // --- if no unevaluated rule left, default rule value should be used
                if (defaultRules.length) {
                    this.completeRuleResults[
                        fullName
                    ] = this.createCompleteRuleResult(defaultRules[0]);
                    return;
                } else {
                    // --- no matched rule left; Not possible
                    throw new Error(
                        `Unexpected empty rule result for ${fullName}`
                    );
                }
            } else {
                // --- do nothing
                // --- Some defaultRules might be able to strip out once
                // --- nonCompletedRules are determined later
                return;
            }
        });
    }

    reduceDependencies() {
        const rules = this.rules.filter(r => !r.isCompleteEvaluated);
        if (!rules.length) return;
        for (let i = 0; i < rules.length; i++) {
            const rule = rules[i];
            rule.expressions = rule.expressions.map(e => e.evaluate());
            rule.evaluate();
        }
        // --- unmatched non-default rule can be stripped out
        this.rules = this.rules.filter(
            r => !(r.isCompleteEvaluated && !r.isMatched && !r.isDefault)
        );
    }

    evaluateRule(fullName: string): CompleteRuleResult {
        const rules = this.rules.filter(r => r.fullName === fullName);
        if (!rules.length) {
            throw new Error(
                `Can't locate rule ${fullName} for evaluation from parse result!`
            );
        }

        return {
            fullName,
            name: rules[0].name,
            value: rules[0].value,
            residualRules: []
        };
    }

    createCompleteRuleResult(rule: RegoRule): CompleteRuleResult {
        return {
            fullName: rule.fullName,
            name: rule.name,
            value: rule.value
        };
    }

    reportWarns(msg: string) {
        this.warns.push(msg);
        this.hasWarns = true;
    }
}
