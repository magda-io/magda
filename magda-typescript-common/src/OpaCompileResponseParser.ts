import * as _ from "lodash";
import { AnyARecord } from "dns";

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

    static parseFromData(r: any, packageName: string): RegoRule {
        const ruleName = r.head && r.head.name ? r.head.name : "";
        const ruleFullName = [packageName, ruleName].join(".");
        const ruleIsDefault = r.default === true;
        const ruleValue =
            r.head && r.head.value && r.head.value.value
                ? r.head.value.value
                : true;
        const ruleOptions: RegoRuleOptions = {
            name: ruleName,
            fullName: ruleFullName,
            isDefault: ruleIsDefault,
            value: ruleValue,
            expressions: RegoRule.createExpressionsFromRuleBodyData(r.body)
        };
        return new RegoRule(ruleOptions);
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
    eq: "=",
    equal: "=",
    neq: "!=",
    lt: "<",
    gt: ">",
    lte: "<=",
    gte: ">="
};

interface RegoTerm {
    type: string;
    value: RegoRef | RegoValue;
}

class RegoExp {
    public terms: RegoTerm[];
    public isNegated: boolean;

    constructor(terms: RegoTerm[], isNegated: boolean = false) {
        this.terms = terms;
        this.isNegated = isNegated;
    }

    /**
     * As expessions are always combined with AND
     * always true will be removed from terms
     * always false should
     */
    compress() {
        const falseTerm = this.terms.find(term => term.value === false);
        if (!_.isUndefined(falseTerm)) {
            this.terms = [falseTerm];
        } else {
            this.terms = this.terms.filter(term => term.value !== true);
        }
    }

    static parseFromData(expData: any): RegoExp {
        const isNegated = expData.negated === true;
        if (_.isEmpty(expData.terms)) {
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

        return new RegoExp(terms);
    }
}

class RegoRef {
    public parts: RegoRefPart[];

    constructor(parts: RegoRefPart[]) {
        this.parts = parts;
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

export default class OpaCompileResponseParser {
    public hasWarns: boolean = false;
    public warns: string[] = [];

    private data: any = null;
    private rules: RegoRule[] = [];

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
                this.rules.push(regoRule);
            });
        });
        return this.rules;
    }

    reportWarns(msg: string) {
        this.warns.push(msg);
        this.hasWarns = true;
    }
}
