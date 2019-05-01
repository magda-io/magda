import * as _ from "lodash";

type RegoValue = string | boolean | number | Array<any> | Object;

interface RegoRuleOptions {
    name: string;
    fullName: string;
    isDefault: boolean;
    value: RegoValue;
    expressions: RegoExp[];
    isCompleteEvaluated?: boolean;
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

        if (this.name === "") {
            throw new Error("Rule name can't be empty");
        }

        if (this.fullName === "") {
            throw new Error("Rule fullName can't be empty");
        }
    }

    clone(): RegoRule {
        const regoRule = new RegoRule({
            name: this.name,
            fullName: this.fullName,
            isDefault: this.isDefault,
            value: this.value,
            isCompleteEvaluated: this.isCompleteEvaluated,
            expressions: this.expressions.map(e => e.clone())
        });
        regoRule.isMatched = this.isMatched;
        return regoRule;
    }

    evaluate() {
        this.expressions = this.expressions.map(exp => exp.evaluate());
        const falseExpression = this.expressions.find(
            exp => exp.isCompleteEvaluated && exp.value === false
        );
        if (!_.isUndefined(falseExpression)) {
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
            }
        }
        return this;
    }

    static parseFromData(r: any, packageName: string): RegoRule {
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
            expressions: RegoRule.createExpressionsFromRuleBodyData(r.body)
        };
        const regoRule = new RegoRule(ruleOptions);
        regoRule.evaluate();
        return regoRule;
    }

    static createExpressionsFromRuleBodyData(data: any): RegoExp[] {
        if (!_.isArray(data) || !data.length) {
            throw new Error(`Encountered empty rule body.`);
        }
        return data.map(expData => RegoExp.parseFromData(expData));
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

class RegoExp {
    public terms: RegoTerm[];
    public isNegated: boolean;
    public isCompleteEvaluated: boolean = false;
    public value: RegoValue = null;

    constructor(
        terms: RegoTerm[],
        isNegated: boolean = false,
        isCompleteEvaluated: boolean = false,
        value: RegoValue = null
    ) {
        this.terms = terms;
        this.isNegated = isNegated;
        this.isCompleteEvaluated = isCompleteEvaluated;
        this.value = value;
    }

    clone(): RegoExp {
        const regoExp = new RegoExp(
            this.terms.map(t => this.cloneRegoTerm(t)),
            this.isNegated
        );
        regoExp.isCompleteEvaluated = this.isCompleteEvaluated;
        regoExp.value = this.value;
        return regoExp;
    }

    cloneRegoTerm(term: RegoTerm): RegoTerm {
        if (term.value instanceof RegoRef) {
            return {
                type: term.type,
                value: term.value.clone()
            };
        } else {
            return { ...term };
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
            if (this.terms[0].value instanceof RegoRef) return this;
            this.value = this.terms[0].value;
            // --- try to normalise
            if (this.isNegated) {
                this.value = this.value === false ? true : false;
                this.isNegated = false;
            }
            this.isCompleteEvaluated = true;
            return this;
        } else if (this.terms.length === 3) {
            // --- 3 terms expression e.g. true == true or x >= 3
            // --- we only evalute some redundant expression e.g. true == true or false != true
            const operands: RegoTermValue[] = [];
            let operator = null;
            this.terms.forEach(t => {
                if (t instanceof RegoRef) {
                    if (t.isOperator()) {
                        operator = t.asOperator();
                        return;
                    } else {
                        operands.push(t.value);
                    }
                } else {
                    operands.push(t.value);
                }
            });
            if (!operator) {
                throw new Error(
                    `Invalid 3 terms rego expression, can't locate operator: ${
                        this.terms
                    }`
                );
            }
            if (operands.length !== 2) {
                throw new Error(
                    `Invalid 3 terms rego expression, the number of operands should be 2: ${
                        this.terms
                    }`
                );
            }
            if (operands.findIndex(op => op instanceof RegoRef) !== -1) {
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
                            `Invalid 3 terms rego expression, Unknown operator "${operator}": ${
                                this.terms
                            }`
                        );
                }
                this.isCompleteEvaluated = true;
                this.value = value;
                if (this.isNegated) {
                    this.value = this.value === false ? true : false;
                    this.isNegated = false;
                }
                return this;
            }
        }
        // --- so far there is no 2 terms expression e.g. ! x
        // --- builtin function should never be included in residual rule
        // --- as we won't apply them on unknowns
        return this;
    }

    static parseFromData(expData: any): RegoExp {
        const isNegated = expData.negated === true;
        if (_.isEmpty(expData.terms)) {
            if (isNegated) throw new Error("Invalid negated empty term!");
            return new RegoExp([], isNegated);
        }

        let termsData: any[] = [];
        if (_.isArray(expData.terms)) {
            termsData = expData.terms;
        } else {
            termsData.push(expData.terms);
        }

        const terms: RegoTerm[] = termsData.map((termData: any) => {
            if (termData.type === "ref") {
                return {
                    type: termData.type,
                    value: RegoRef.parseFromData(termData)
                };
            } else {
                return {
                    type: termData.type,
                    value: termData.value
                };
            }
        });

        const exp = new RegoExp(terms, isNegated);
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
                const regoRule = RegoRule.parseFromData(r, packageName);
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
        // --- first call doesn't solve the dependencies
        // --- i.e. a reply on b but b is true thus a should be true
        this.calculateCompleteRuleResult();
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
            rule.expressions = rule.expressions.map(e => {
                e.terms = e.terms.map(t => {
                    if (t instanceof RegoRef) {
                        const result: CompleteRuleResult = this
                            .completeRuleResults[t.fullRefString()];
                        if (!_.isUndefined(result)) {
                            return {
                                type: typeof result.value,
                                value: result.value
                            };
                        }
                    }
                    return t;
                });
                return e.evaluate();
            });
            rule.evaluate();
            if (rule.isCompleteEvaluated) {
                rules[i].isMatched = rule.isMatched;
                rules[i].isCompleteEvaluated = rule.isCompleteEvaluated;
                rules[i].value = rule.value;
            }
        }
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
