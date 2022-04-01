import _ from "lodash";

export type RegoValue = string | boolean | number | Array<any> | Object;

export interface RegoRuleOptions {
    name: string;
    fullName: string;
    isDefault: boolean;
    value: RegoValue;
    expressions: RegoExp[];
    isCompleteEvaluated?: boolean;
    parser: OpaCompileResponseParser;
}

/**
 * @class RegoRule
 * @export
 *
 * RegoRule represents [Rule](https://www.openpolicyagent.org/docs/latest/how-do-i-write-policies/#rules) concept in Rego language.
 * - A simple rule is made up of Rule head, Rule value & Rule body
 * - The Rule value defines the final result of the rule if the rule is matched (i.e. all expressions in rule body are true)
 * - If you didn't sepcify the rule value, it will be assume as boolean value `true`
 * - The rule body is made up of one of more rego expressions (see @class RegoExp) and each of the expression is made up of terms (see @class RegoTerm)
 * - The rule is considered as matched if all expressions in rule body are `true`
 * You can opt to define a `default` rule. A default rule has no rule body and will only considered as matched if all other rules are not matched.
 */
export class RegoRule {
    /**
     * the local name of the rule. i.e. doesn't include full package path
     * e.g. `allow`
     *
     * @type {string}
     * @memberof RegoRule
     */
    public name: string;

    /**
     * Full name of the rule. Includes fulle package path
     * e.g. `data.object.content.allowRead`
     *
     * @type {string}
     * @memberof RegoRule
     */
    public fullName: string;

    /**
     * Whether a rule is a default Rule
     * Its value only be used if any other residual rules are not matched (or no other residual rules)
     *
     * @type {boolean}
     * @memberof RegoRule
     */
    public isDefault: boolean;

    /**
     * Rule value. Rule value is this value if all expression in rule body are true
     * It can be any type. e.g. can be object or array etc. But a simple policy normally outputs a boolean true or false
     *
     * @type {RegoValue}
     * @memberof RegoRule
     */
    public value: RegoValue;

    /**
     * Whether the rule contains any expressions that has any resolvable references.
     * reference start with `input.` should be considered as non-resolvable in context of partial evaluation.
     * When this field is set to `true`, we should not attempt to evaluate this expression.
     * i.e. evaluate() method should return immediately.
     * This will speed up evaluation process.
     *
     * @type {boolean}
     * @memberof RegoRule
     */
    public hasNoResolvableRef: boolean = false;

    /**
     * All Rego expressions in this rule's rule body. @see RegoExp
     *
     * @type {RegoExp[]}
     * @memberof RegoRule
     */
    public expressions: RegoExp[];

    /**
     * If the rule is matched or not
     * Default to undefined
     * Its value is only set when `isCompleteEvaluated` is true
     *
     * @type {boolean}
     * @memberof RegoRule
     */
    public isMatched?: boolean;

    /**
     * If the rule is fully evaluate
     * Default to false
     *
     * @type {boolean}
     * @memberof RegoRule
     */
    public isCompleteEvaluated: boolean;

    /**
     * Reference to OpaParser
     *
     * @private
     * @type {OpaCompileResponseParser}
     * @memberof RegoRule
     */
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

        this.removeDuplicateExpressions();

        if (
            this.expressions?.length &&
            this.expressions.findIndex((exp) => !exp.hasNoResolvableRef) === -1
        ) {
            this.hasNoResolvableRef = true;
        }

        this.evaluate();
    }

    /**
     * OPA PE result might contain duplicate expressions.
     * https://github.com/open-policy-agent/opa/issues/4516
     * This method will remove those duplication by simply string comparison.
     *
     * @return {*}
     * @memberof RegoRule
     */
    removeDuplicateExpressions() {
        if (!this?.expressions?.length) {
            return;
        }
        const expSet = new Set();
        this.expressions = this.expressions.filter((exp) => {
            const orgSetLength = expSet.size;
            // exp.toJSON() is faster than exp.toConciseJSON()
            expSet.add(exp.toJSON(0, true));
            return expSet.size > orgSetLength;
        });
    }

    /**
     * Test whether the rule is an "impossible" rule.
     * If so, the rule should be simply discarded.
     * See: https://github.com/open-policy-agent/opa/issues/4516
     *
     * @return {*}  {boolean}
     * @memberof RegoRule
     */
    isImpossible(): boolean {
        if (!this?.expressions?.length) {
            return false;
        }
        const nonNegatedExpSet = new Set();
        const negatedExps = this.expressions.filter((exp) => {
            if (exp.isNegated) {
                return true;
            } else {
                // add non negated exp content to set
                // exp.toJSON() is faster than exp.toConciseJSON()
                nonNegatedExpSet.add(exp.toJSON(0, true));
                return false;
            }
        });
        if (!negatedExps.length) {
            return false;
        }
        for (const exp of negatedExps) {
            if (nonNegatedExpSet.has(exp.toJSON(0, true, true))) {
                return true;
            }
        }
        return false;
    }

    clone(options: Partial<RegoRuleOptions> = {}): RegoRule {
        const regoRule = new RegoRule({
            name: this.name,
            fullName: this.fullName,
            isDefault: this.isDefault,
            value: this.value,
            isCompleteEvaluated: this.isCompleteEvaluated,
            expressions: this.expressions.map((e) => e.clone()),
            parser: this.parser,
            ...options
        });
        regoRule.isMatched = this.isMatched;
        return regoRule;
    }

    /**
     * Re-evaluate this rule
     * If fully evaluated, this.isCompleteEvaluated will be set to true
     *
     * @returns
     * @memberof RegoRule
     */
    evaluate() {
        if (this.hasNoResolvableRef) {
            return this;
        }

        if (this.isCompleteEvaluated) {
            return this;
        }

        if (!this?.expressions?.length) {
            // a rule with empty body / no expression is matched
            this.isCompleteEvaluated = true;
            this.isMatched = true;
            return this;
        }

        let unresolvable = false;
        for (let i = 0; i < this.expressions.length; i++) {
            const exp = this.expressions[i];
            exp.evaluate();
            if (!exp.isResolvable()) {
                unresolvable = true;
                continue;
            }
            if (!exp.isMatched()) {
                // --- rule expressions are always evaluated in the context of AND
                // --- any false expression will make the rule not match
                this.isCompleteEvaluated = true;
                this.isMatched = false;
                return this;
            }
        }

        if (unresolvable) {
            // there is at least one exp is unresolvable now
            return this;
        } else {
            this.isCompleteEvaluated = true;
            this.isMatched = true;
            return this;
        }
    }

    /**
     * Whether or not the rule is resolvable (i.e. we can tell whether it's matched or not) now.
     *
     * @return {*}  {boolean}
     * @memberof RegoRule
     */
    isResolvable(): boolean {
        if (!this.isCompleteEvaluated) {
            this.evaluate();
        }
        return this.isCompleteEvaluated;
    }

    /**
     * Generate Human Readable string of this rule
     * If it's fully evaluated, the output will be true or false (or actual rule value)
     * Otherwise, will generate expressions concate with `AND`
     *
     * @returns {string}
     * @memberof RegoRule
     */
    toHumanReadableString(): string {
        if (this.isCompleteEvaluated) {
            if (this.isMatched) {
                return value2String(this.value);
            } else {
                return "";
            }
        } else {
            const parts = this.expressions.map((e) =>
                e.toHumanReadableString()
            );
            return parts.join(" AND \n");
        }
    }

    toData() {
        return {
            default: this.isDefault,
            value: this.value,
            fullName: this.fullName,
            name: this.name,
            expressions: this.expressions.map((exp, idx) => exp.toData(idx))
        };
    }

    toJson() {
        return JSON.stringify(this.toData());
    }

    toConciseData() {
        return {
            default: this.isDefault,
            value: this.value,
            fullName: this.fullName,
            name: this.name,
            expressions: this.expressions.map((exp) => exp.toConciseData())
        };
    }

    toConciseJSON() {
        return JSON.stringify(this.toConciseData());
    }

    /**
     * Create RegoRule from Opa response data
     *
     * @static
     * @param {*} r
     * @param {string} packageName
     * @param {OpaCompileResponseParser} parser
     * @returns {RegoRule}
     * @memberof RegoRule
     */
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
        return regoRule;
    }

    static createExpressionsFromRuleBodyData(
        data: any,
        parser: OpaCompileResponseParser
    ): RegoExp[] {
        if (!_.isArray(data) || !data.length) {
            throw new Error(`Encountered empty rule body.`);
        }
        return data.map((expData) => RegoExp.parseFromData(expData, parser));
    }

    static randomRuleName(prefix: string) {
        return (prefix + Math.random()).replace(".", "_");
    }

    static createFromValue(val: RegoValue, parser: OpaCompileResponseParser) {
        const ruleName = RegoRule.randomRuleName("fixed_value_rule_");
        return new RegoRule({
            isDefault: false,
            name: ruleName,
            fullName: ruleName,
            isCompleteEvaluated: true,
            expressions: [],
            value: val,
            parser
        });
    }
}

export interface RegoRefPart {
    type: string;
    value: string;
}

export const RegoOperators = {
    eq: "=", // --- eq & equal are different in rego but no difference for value evluation.
    equal: "=",
    neq: "!=",
    lt: "<",
    gt: ">",
    lte: "<=",
    gte: ">="
} as const;

export type RegoOperatorAstString = keyof typeof RegoOperators;

export type RegoOperatorString = typeof RegoOperators[RegoOperatorAstString];

export type RegoTermValue = RegoRef | RegoValue;

/**
 * RegoTerm represent the basic elements that creates an expressions.
 * e.g. An expression `a > 4` is made up of 3 terms
 * - Reference Term: `a`
 * - Operator Term `>`
 * - Value Term: `4`
 *
 * @export
 * @class RegoTerm
 */
export class RegoTerm {
    public type: string;
    public value: RegoTermValue;
    private parser: OpaCompileResponseParser;

    /**
     * Whether the expression contains any resolvable references.
     * reference start with `input.` should be considered as non-resolvable in context of partial evaluation.
     * When this field is set to `true`, we should not attempt to evaluate this expression.
     * i.e. evaluate() method should return immediately.
     * This will speed up evaluation process.
     *
     * @type {boolean}
     * @memberof RegoTerm
     */
    public hasNoResolvableRef: boolean = false;

    constructor(
        type: string,
        value: RegoTermValue,
        parser: OpaCompileResponseParser
    ) {
        this.type = type;
        this.value = value;
        this.parser = parser;
        if (this.value instanceof RegoRef && this.value.hasNoResolvableRef) {
            this.hasNoResolvableRef = true;
        }
    }

    clone() {
        return new RegoTerm(this.type, this.value, this.parser);
    }

    /**
     * If it's a reference term, return its full string representation
     *
     * @returns
     * @memberof RegoTerm
     */
    asString() {
        if (this.value instanceof RegoRef) return this.value.fullRefString();
        else return JSON.stringify(this.value);
    }

    /**
     * If it's a reference term. A operator is an Reference term as well
     *
     * @returns {boolean}
     * @memberof RegoTerm
     */
    isRef(): boolean {
        if (this.value instanceof RegoRef) return true;
        return false;
    }

    /**
     * Return RegoRef instance if this term is a RegoRef.
     *
     * @returns {RegoRef}
     * @memberof RegoTerm
     */
    getRef(): RegoRef {
        if (this.isRef()) {
            return this.value as RegoRef;
        }
        throw new Error(`Term ${this.asString()} is not a ref`);
    }

    /**
     * If the term is a reference and it contains any collection lookup
     * e.g.
     * - objectA.propB.collectionC[_]
     * - objectA.propB.collectionC[_].ABC[_].name
     * - objectA.propB.collectionC[_].id
     *
     * @returns {boolean}
     * @memberof RegoTerm
     */
    hasCollectionLookup(): boolean {
        if (!this.isRef()) return false;
        const ref = this.getRef();
        return ref.hasCollectionLookup();
    }

    /**
     * The term is not only a Reference but a reference contains simple collection lookup
     * i.e. only contains one collection lookup and the whole ref ends with the only collection lookup
     * e.g. objectA.propB.collectionC[_]
     * Note: objectA.propB.collectionC[_].name is not a simple collection lookup as it resolve to single value (`name` property)
     * rather than a collection
     *
     * @returns {boolean}
     * @memberof RegoTerm
     */
    isSimpleCollectionLookup(): boolean {
        if (!this.isRef()) return false;
        const ref = this.getRef();
        return ref.isSimpleCollectionLookup();
    }

    /**
     *
     *
     * @returns {boolean}
     * @memberof RegoTerm
     */
    isResolveAsCollectionValue(): boolean {
        if (!this.isRef()) return false;
        const ref = this.getRef();
        return ref.isResolveAsCollectionValue();
    }

    /**
     * If it's a reference term, return its full string representation
     * Otherwise, throw exception
     *
     * @param {string[]} [removalPrefixs=[]]
     * @returns {string}
     * @memberof RegoTerm
     */
    fullRefString(removalPrefixs: string[] = []): string {
        if (this.value instanceof RegoRef) {
            return this.value.fullRefString(removalPrefixs);
        } else {
            throw new Error("Tried to call `fullRefString` on non Ref term.");
        }
    }

    /**
     * If it's a reference term, return its string representation (not include ending [_])
     * Otherwise, throw exception
     *
     * @param {string[]} [removalPrefixs=[]]
     * @returns {string}
     * @memberof RegoTerm
     */
    refString(removalPrefixs: string[] = []): string {
        if (this.value instanceof RegoRef) {
            return this.value.refString(removalPrefixs);
        } else {
            throw new Error("Tried to call `refString` on non Ref term.");
        }
    }

    /**
     * Return term as operator string e.g. `=`, `>=` etc.
     *
     * @returns {string}
     * @memberof RegoTerm
     */
    asOperator() {
        if (this.value instanceof RegoRef) {
            return this.value.asOperator();
        } else {
            throw new Error("Tried to call `asOperator` on non Ref term.");
        }
    }

    /**
     * If it's a operator term
     *
     * @returns {boolean}
     * @memberof RegoTerm
     */
    isOperator(): boolean {
        if (this.value instanceof RegoRef) {
            return this.value.isOperator();
        } else {
            return false;
        }
    }

    /**
     * Tried to determine the value of the term
     *
     * @returns {RegoValue}
     * @memberof RegoTerm
     */
    getValue(): RegoValue {
        if (this.hasNoResolvableRef) {
            return undefined;
        }
        if (!this.isRef()) {
            return this.value;
        } else {
            if (this.isOperator()) {
                return undefined;
            } else {
                const fullName = this.fullRefString();
                if (!this.parser.isRefResolvable(fullName)) {
                    return undefined;
                }
                return this.parser.getRefValue(fullName);
            }
        }
    }

    /**
     * Whether or not the RegoTerm is resolvable
     *
     * @return {*}  {boolean}
     * @memberof RegoTerm
     */
    isValueResolvable(): boolean {
        if (this.hasNoResolvableRef) {
            return false;
        }
        if (!this.isRef()) {
            return true;
        } else {
            if (this.isOperator()) {
                return false;
            } else {
                const fullName = this.fullRefString();
                return this.parser.isRefResolvable(fullName);
            }
        }
    }

    toData() {
        if (this.isRef()) {
            return (this.value as RegoRef).toData();
        } else {
            return {
                type: this.type,
                value: this.value
            };
        }
    }

    toJson(): string {
        return JSON.stringify(this.toData());
    }

    toConciseData() {
        if (this.isRef()) {
            return {
                isRef: true,
                value: this.fullRefString()
            };
        } else {
            return {
                isRef: false,
                value: this.value
            };
        }
    }

    toConciseJSON(): string {
        return JSON.stringify(this.toConciseData());
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

/**
 * Represents Rego expression
 *
 * @export
 * @class RegoExp
 */
export class RegoExp {
    /**
     * All RegoTerms belongs to this expression
     *
     * @type {RegoTerm[]}
     * @memberof RegoExp
     */
    public terms: RegoTerm[];

    /**
     * Whether the expression contains any resolvable references.
     * reference start with `input.` should be considered as non-resolvable in context of partial evaluation.
     * When this field is set to `true`, we should not attempt to evaluate this expression.
     * i.e. evaluate() method should return immediately.
     * This will speed up evaluation process.
     *
     * @type {boolean}
     * @memberof RegoExp
     */
    public hasNoResolvableRef: boolean = false;

    /**
     * Whether this expression is a negative expression
     * i.e. it's final evaluation result should be `false` if result is `true`
     *
     * @type {boolean}
     * @memberof RegoExp
     */
    public isNegated: boolean;

    /**
     * If it's complete evaluated
     *
     * @type {boolean}
     * @memberof RegoExp
     */
    public isCompleteEvaluated: boolean = false;

    /**
     * The value of the expression
     *
     * @type {RegoValue}
     * @memberof RegoExp
     */
    public value: RegoValue = null;

    /**
     * Ref to Opa Parser
     *
     * @private
     * @type {OpaCompileResponseParser}
     * @memberof RegoExp
     */
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
        if (
            this?.terms?.length &&
            this.terms.findIndex((item) => !item.hasNoResolvableRef) === -1
        ) {
            this.hasNoResolvableRef = true;
        }
    }

    clone(): RegoExp {
        const regoExp = new RegoExp(
            this.terms.map((t) => t.clone()),
            this.isNegated,
            this.isCompleteEvaluated,
            this.value,
            this.parser
        );
        return regoExp;
    }

    /**
     * For debug usage, print terms as easy to ready short string
     *
     * @returns
     * @memberof RegoExp
     */
    termsAsString() {
        return this.terms.map((t) => t.asString()).join(" ");
    }

    /**
     * Print concise format expression string presentation.
     * Can be used for debugging
     *
     * @return {*}
     * @memberof RegoExp
     */
    asString() {
        if (this.isNegated) {
            return "NOT " + this.termsAsString();
        } else {
            return this.termsAsString();
        }
    }

    /**
     * Output human readable string
     *
     * @returns {string}
     * @memberof RegoExp
     */
    toHumanReadableString(): string {
        if (this.terms.length === 1) {
            const value = this.terms[0].getValue();
            const parts = [];
            if (this.isNegated) parts.push("NOT");

            if (!_.isUndefined(value)) {
                parts.push(value2String(value));
            } else {
                parts.push(this.terms[0].fullRefString());
            }
            return parts.join(" ");
        } else if (this.terms.length === 3) {
            const [operator, operands] = this.toOperatorOperandsArray();
            const parts = [];
            if (operands[0].isRef()) {
                parts.push(operands[0].fullRefString());
            } else {
                parts.push(value2String(operands[0].getValue()));
            }
            parts.push(operator);
            if (operands[1].isRef()) {
                parts.push(operands[1].fullRefString());
            } else {
                parts.push(value2String(operands[1].getValue()));
            }
            const expStr = parts.join(" ");
            if (this.isNegated) return `NOT (${expStr})`;
            return expStr;
        }
        throw new Error(`Invalid rego expression: ${this.termsAsString()}`);
    }

    /**
     * Try to determins its value
     *
     * @returns
     * @memberof RegoExp
     */
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

    /**
     * Whether or not a expression should be considered as "matched".
     * If all expressions of a rule are "matched", the rule will be considered as "matched".
     * Thus, the rule has a value.
     *
     * Please note: if an expression's value is `0`, empty string "", null etc, the expression is considered as "matched".
     * We only consider an expression as "Not Matched" when the expression has value `false` or is undefined.
     *
     * @return {boolean}
     * @memberof RegoExp
     */
    isMatched() {
        if (!this.isResolvable()) {
            return undefined;
        }
        const isMatched =
            this.value === false || _.isUndefined(this.value) ? false : true;
        if (this.isNegated) {
            return !isMatched;
        } else {
            return isMatched;
        }
    }

    /**
     * Whether or not the expression is resolvable now.
     *
     * @return {boolean}
     * @memberof RegoExp
     */
    isResolvable(): boolean {
        if (!this.isCompleteEvaluated) {
            this.evaluate();
        }
        return this.isCompleteEvaluated;
    }

    /**
     * Convert operator term to string and put rest operands into an array.
     * And then return a [Operator, Operands] structure
     *
     * @returns {[string, RegoTerm[]]}
     * @memberof RegoExp
     */
    toOperatorOperandsArray(): [RegoOperatorString, RegoTerm[]] {
        if (this.terms.length !== 3) {
            throw new Error(
                `Can't get Operator & Operands from non 3 terms expression: ${this.termsAsString()}`
            );
        }
        const operands: RegoTerm[] = [];
        let operator = null;
        this.terms.forEach((t) => {
            if (t.isOperator()) {
                operator = t.asOperator();
            } else {
                operands.push(t);
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
        return [operator, operands];
    }

    /**
     * Try to evaluate the expression
     *
     * @returns
     * @memberof RegoExp
     */
    evaluate() {
        if (this.hasNoResolvableRef) {
            return this;
        }
        if (this.isCompleteEvaluated) {
            return this;
        }
        // --- so far there is no 2 terms expression e.g. ! x
        // --- builtin function should never be included in residual rule
        // --- as we won't apply them on unknowns
        if (this.terms.length === 0) {
            // --- exp should be considered as matched (true)
            this.isCompleteEvaluated = true;
            this.value = true;
            return this;
        } else if (this.terms.length === 1) {
            const term = this.terms[0];
            if (!term.isValueResolvable()) {
                return this;
            }
            const value = term.getValue();
            this.value = value;
            this.isCompleteEvaluated = true;
            return this;
        } else if (this.terms.length === 3) {
            // --- 3 terms expression e.g. true == true or x >= 3
            // --- we only evalute some redundant expression e.g. true == true or false != true
            const [operator, operands] = this.toOperatorOperandsArray();
            if (
                !operands[0].isValueResolvable() ||
                !operands[1].isValueResolvable()
            ) {
                // if one of the term value is resolvable now, we can't evaluate further.
                return this;
            }

            const operandsValues = operands.map((op) => op.getValue());
            if (operandsValues.findIndex((v) => typeof v === "undefined")) {
            }
            let value = null;
            switch (operator) {
                case "=":
                    value = operandsValues[0] === operandsValues[1];
                    break;
                case ">":
                    value = operandsValues[0] > operandsValues[1];
                    break;
                case "<":
                    value = operandsValues[0] < operandsValues[1];
                    break;
                case ">=":
                    value = operandsValues[0] >= operandsValues[1];
                    break;
                case "<=":
                    value = operandsValues[0] <= operandsValues[1];
                    break;
                case "!=":
                    value = operandsValues[0] != operandsValues[1];
                    break;
                default:
                    throw new Error(
                        `Invalid 3 terms rego expression, Unknown operator "${operator}": ${this.termsAsString()}`
                    );
            }
            this.isCompleteEvaluated = true;
            this.value = value;
            return this;
        } else {
            throw new Error(
                `Invalid ${
                    this.terms.length
                } terms rego expression: ${this.termsAsString()}`
            );
        }
    }

    toData(index: number = 0, ignoreIndex = false, ignoreNegated = false) {
        const terms = this.terms.map((term) => term.toData());
        if (this.isNegated && !ignoreNegated) {
            if (ignoreIndex) {
                return {
                    negated: true,
                    terms
                };
            } else {
                return {
                    negated: true,
                    index,
                    terms
                };
            }
        } else {
            if (ignoreIndex) {
                return {
                    terms
                };
            } else {
                return {
                    index,
                    terms
                };
            }
        }
    }

    toJSON(
        index: number = 0,
        ignoreIndex = false,
        ignoreNegated = false
    ): string {
        return JSON.stringify(this.toData(index, ignoreIndex, ignoreNegated));
    }

    toConciseData() {
        let data;
        if (this.terms.length === 1) {
            const term = this.terms[0];
            data = {
                negated: this.isNegated,
                operator: null as string | null,
                operands: [term.toConciseData()]
            };
        } else {
            const [operator, operands] = this.toOperatorOperandsArray();
            data = {
                negated: this.isNegated,
                operator,
                operands: operands.map((item) => item.toConciseData())
            };
        }
        return data;
    }

    toConciseJSON(): string {
        return JSON.stringify(this.toConciseData());
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

/**
 * Represents a special Rego Term type: reference term
 * You shouldn't use this class directly
 *
 * @export
 * @class RegoRef
 */
export class RegoRef {
    public parts: RegoRefPart[];

    /**
     * Whether the expression contains any resolvable references.
     * reference start with `input.` should be considered as non-resolvable in context of partial evaluation.
     * When this field is set to `true`, we should not attempt to evaluate this expression.
     * i.e. evaluate() method should return immediately.
     * This will speed up evaluation process.
     *
     * @type {boolean}
     * @memberof RegoRef
     */
    public hasNoResolvableRef: boolean = false;

    constructor(parts: RegoRefPart[]) {
        this.parts = parts;
        if (
            // `input.` ref should be considered not resolvable in partial evaluate context.
            (this.parts.length && this.parts[0]?.value === "input") ||
            this.isOperator()
        ) {
            this.hasNoResolvableRef = true;
        }
    }

    clone(): RegoRef {
        return new RegoRef(this.parts.map((p) => ({ ...p })));
    }

    toData() {
        return {
            type: "ref",
            value: this.parts
        };
    }

    toJson(): string {
        return JSON.stringify(this.toData());
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

    removeAllPrefixs(str: string, removalPrefixs: string[] = []) {
        if (!removalPrefixs.length) return str;
        let result = str;
        removalPrefixs
            // --- starts from longest prefix
            .sort((a: string, b: string) => b.length - a.length)
            .forEach((prefix) => {
                if (!prefix) return;
                const idx = result.indexOf(prefix);
                if (idx !== 0) return;
                result = result.substring(prefix.length);
            });
        return result;
    }

    fullRefString(removalPrefixs: string[] = []): string {
        let isFirstPart = true;
        const str = this.parts
            .map((part) => {
                let partStr = "";
                if (isFirstPart) {
                    partStr = part.value;
                } else {
                    if (part.type == "var") {
                        // --- it's a collection lookup
                        // --- var name doesn't matter for most cases
                        partStr = "[_]";
                    } else {
                        partStr = part.value;
                    }
                }
                if (isFirstPart) isFirstPart = false;
                return partStr;
            })
            .join(".");
        return this.removeAllPrefixs(str, removalPrefixs);
    }

    refString(removalPrefixs: string[] = []): string {
        return this.fullRefString(removalPrefixs).replace("\\[_\\]$", "");
    }

    asCollectionRefs(removalPrefixs: string[] = []): string[] {
        return this.fullRefString(removalPrefixs)
            .split("[_]")
            .map((refStr) => refStr.replace(/^\./, ""));
    }

    isOperator(): boolean {
        return Object.keys(RegoOperators).indexOf(this.fullRefString()) !== -1;
    }

    // --- the first var type won't count as collection lookup
    hasCollectionLookup(): boolean {
        if (this.parts.length <= 1) return false;
        else {
            return (
                this.parts.slice(1).findIndex((part) => part.type === "var") !==
                -1
            );
        }
    }

    // -- simple collection only contains 1 level lookup
    // -- we don't need Nested Query to handle it
    isSimpleCollectionLookup(): boolean {
        if (this.parts.length <= 1) return false;
        else {
            return (
                this.parts.slice(1).findIndex((part) => part.type === "var") ===
                this.parts.length - 2
            );
        }
    }

    // --- see comment for same name method of RegoTerm
    isResolveAsCollectionValue(): boolean {
        const refString = this.fullRefString();
        return refString.lastIndexOf("[_]") === refString.length - 3;
    }

    asOperator(): RegoOperatorString | null {
        if (this.isOperator())
            return RegoOperators[this.fullRefString() as RegoOperatorAstString];
        else return null;
    }
}

export interface CompleteRuleResult {
    fullName: string;
    name: string;
    value: RegoValue;
    isCompleteEvaluated: boolean;
    residualRules?: RegoRule[];
}

export function value2String(value: RegoValue) {
    if (_.isBoolean(value) || _.isNumber(value)) return value.toString();
    else return JSON.stringify(value);
}

export class RegoRuleSet {
    public fullName: string = "";
    public name: string = "";
    public rules: RegoRule[] = [];
    public defaultRule: RegoRule | null = null;
    public value?: any;
    public isCompleteEvaluated: boolean = false;
    public parser: OpaCompileResponseParser;

    /**
     * Whether the ruleSet contains any rules that has any resolvable references.
     * reference start with `input.` should be considered as non-resolvable in context of partial evaluation.
     * When this field is set to `true`, we should not attempt to evaluate this expression.
     * i.e. evaluate() method should return immediately.
     * This will speed up evaluation process.
     *
     * @type {boolean}
     * @memberof RegoRuleSet
     */
    public hasNoResolvableRef: boolean = false;

    constructor(
        parser: OpaCompileResponseParser,
        rules: RegoRule[],
        fullName: string = "",
        name: string = ""
    ) {
        this.parser = parser;
        if (rules?.length) {
            const defaultRuleIdx = rules.findIndex((r) => r.isDefault);
            if (defaultRuleIdx !== -1) {
                this.defaultRule = rules[defaultRuleIdx];
            }
            this.rules = rules.filter((r) => !r.isDefault);
        }
        if (fullName) {
            this.fullName = fullName;
        } else if (rules?.[0]?.fullName) {
            this.fullName = rules[0].fullName;
        }

        if (name) {
            this.name = name;
        } else if (rules?.[0]?.name) {
            this.name = rules[0].name;
        }
        if (
            this.rules.length &&
            this.rules.findIndex((r) => !r.hasNoResolvableRef) === -1
        ) {
            this.hasNoResolvableRef = true;
        }
        this.evaluate();
    }

    evaluate(): RegoRuleSet {
        if (this.hasNoResolvableRef) {
            return this;
        }

        if (this.isCompleteEvaluated) {
            return this;
        }

        if (!this.rules?.length) {
            if (!this.defaultRule) {
                this.isCompleteEvaluated = true;
                this.value = undefined;
                return this;
            } else {
                if (this.defaultRule.isResolvable()) {
                    this.isCompleteEvaluated = true;
                    this.value = this.defaultRule.value;
                    return this;
                } else {
                    return this;
                }
            }
        }
        this.rules.forEach((r) => r.evaluate());
        const matchedRule = this.rules.find(
            (r) => r.isResolvable() && r.isMatched
        );
        if (matchedRule) {
            this.isCompleteEvaluated = true;
            this.value = matchedRule.value;
            return this;
        }

        if (this.rules.findIndex((r) => !r.isResolvable()) !== -1) {
            // still has rule unresolvable
            return this;
        }

        // rest (if any) are all unmatched rules
        if (!this.defaultRule) {
            this.isCompleteEvaluated = true;
            this.value = undefined;
            return this;
        } else {
            if (this.defaultRule.isResolvable()) {
                this.isCompleteEvaluated = true;
                this.value = this.defaultRule.value;
                return this;
            } else {
                return this;
            }
        }
    }

    isResolvable(): boolean {
        if (!this.isCompleteEvaluated) {
            this.evaluate();
        }
        return this.isCompleteEvaluated;
    }

    getResidualRules(): RegoRule[] {
        if (this.isResolvable()) {
            return [];
        }

        let rules = this.defaultRule
            ? [this.defaultRule, ...this.rules]
            : [...this.rules];

        rules = this.rules.filter((r) => !r.isResolvable());
        if (!rules.length) {
            return [];
        }

        rules = _.flatMap(rules, (rule) => {
            // all resolvable expressions can all be ignored as:
            // - if the expression is resolved to "matched", it won't impact the result of the rule
            // - if the expression is resolved to "unmatched", the rule should be resolved to "unmatched" earlier.
            const unresolvedExpressions = rule.expressions.filter(
                (exp) => !exp.isResolvable()
            );
            if (unresolvedExpressions.length !== 1) {
                return [rule];
            }
            // For rules with single expression, reduce the layer by replacing it with target reference rules
            const exp = unresolvedExpressions[0];
            if (exp.terms.length === 1) {
                const fullName = exp.terms[0].fullRefString();
                const ruleSet = this.parser.ruleSets[fullName];
                if (!ruleSet) {
                    const compressedRule = rule.clone();
                    compressedRule.expressions = [exp];
                    return [compressedRule];
                }
                return ruleSet.getResidualRules();
            } else if (exp.terms.length === 3) {
                const [operator, [op1, op2]] = exp.toOperatorOperandsArray();
                if (operator != "=" && operator != "!=") {
                    // For now, we will only further process the ref when operator is = or !=
                    return [rule];
                }
                if (!op1.isValueResolvable() && !op2.isValueResolvable()) {
                    // when both op1 & op1 are not resolvable ref, we will not attempt to process further
                    return [rule];
                }
                const value = op1.isValueResolvable()
                    ? op1.getValue()
                    : op2.getValue();
                const refTerm = op1.isValueResolvable() ? op2 : op1;

                const fullName = refTerm.fullRefString();
                const ruleSet = this.parser.ruleSets[fullName];
                if (!ruleSet) {
                    const compressedRule = rule.clone();
                    compressedRule.expressions = [exp];
                    return [compressedRule];
                }
                let refRules = ruleSet.getResidualRules();

                // when negated expression, reverse the operator
                const convertedOperator: RegoOperatorString = exp.isNegated
                    ? operator == "="
                        ? "!="
                        : "="
                    : operator;

                if (convertedOperator == "=") {
                    refRules = refRules.filter((r) => r.value == value);
                } else {
                    refRules = refRules.filter((r) => r.value != value);
                }
                if (!refRules.length) {
                    // this means this rule can never matched
                    return [];
                }
                return refRules;
            } else {
                throw new Error(
                    `Failed to produce residualRules for rule: ${rule.toJson()}`
                );
            }
        });

        return rules;
    }
}

/**
 * OPA result Parser
 *
 * @export
 * @class OpaCompileResponseParser
 */
export default class OpaCompileResponseParser {
    /**
     * If a warning is produced during the parsing
     *
     * @type {boolean}
     * @memberof OpaCompileResponseParser
     */
    public hasWarns: boolean = false;

    /**
     * Any warnings produced during the parsing
     *
     * @type {string[]}
     * @memberof OpaCompileResponseParser
     */
    public warns: string[] = [];

    private data: any = null;

    /**
     * Inital Rules parsed from result
     * Only for debug purpose
     *
     * @type {RegoRule[]}
     * @memberof OpaCompileResponseParser
     */
    public originalRules: RegoRule[] = [];

    /**
     * Parsed, compressed & evaluated rules
     *
     * @type {RegoRule[]}
     * @memberof OpaCompileResponseParser
     */
    public rules: RegoRule[] = [];

    /**
     * Parsed, compressed & evaluated rule sets
     *
     * @type {RegoRuleSet[]}
     * @memberof OpaCompileResponseParser
     */
    public ruleSets: {
        [fullName: string]: RegoRuleSet;
    } = {};

    public queries: RegoExp[] = [];

    /**
     * A cache of all resolved rule result
     *
     * @type {{
     *         [fullName: string]: CompleteRuleResult;
     *     }}
     * @memberof OpaCompileResponseParser
     */
    public completeRuleResults: {
        [fullName: string]: CompleteRuleResult;
    } = {};

    /**
     * The pseudo query rule name
     * The parser will assign a random pseudo rule name to the query expressions you submit.
     *
     * @type {string}
     * @memberof OpaCompileResponseParser
     */
    public readonly pseudoQueryRuleName: string = RegoRule.randomRuleName(
        "default_rule_"
    );

    private ruleDuplicationCheckCache: { [key: string]: Set<string> } = {};

    private setQueryRuleResult(val: RegoValue) {
        this.completeRuleResults[this.pseudoQueryRuleName] = {
            fullName: this.pseudoQueryRuleName,
            name: this.pseudoQueryRuleName,
            value: val,
            isCompleteEvaluated: true
        };
    }

    /**
     * Parse OPA result Response
     *
     * @param {*} json
     * @returns {RegoRule[]}
     * @memberof OpaCompileResponseParser
     */
    parse(json: any): RegoRule[] {
        if (_.isString(json)) {
            this.data = JSON.parse(json);
        } else {
            this.data = json;
        }
        /**
         * OPA might output {"result": {}} as unconditional `false` or never matched
         */
        if (!this.data.result || !Object.keys(this.data.result).length) {
            // --- mean no rule matched
            this.setQueryRuleResult(false);
            return [];
        }
        this.data = this.data.result;
        if (
            !this.data.queries ||
            !_.isArray(this.data.queries) ||
            !this.data.queries.length
        ) {
            this.setQueryRuleResult(false);
            return [];
        }

        if (this.data.queries.findIndex((q: any) => !q?.length) !== -1) {
            //  when query is always true, the "queries" value in the result will contain an empty array
            this.setQueryRuleResult(true);
            return [];
        }

        const queries: any[] = this.data.queries;

        if (queries) {
            if (
                queries.findIndex(
                    (ruleBody) => !ruleBody || !ruleBody.length
                ) !== -1
            ) {
                // --- there is an empty array --- indicates unconditional matched
                this.setQueryRuleResult(true);
                return [];
            }
            queries.forEach((ruleBody: any, i: number) => {
                const rule = new RegoRule({
                    name: this.pseudoQueryRuleName,
                    fullName: this.pseudoQueryRuleName,
                    expressions: RegoRule.createExpressionsFromRuleBodyData(
                        ruleBody,
                        this
                    ),
                    isDefault: false,
                    isCompleteEvaluated: false,
                    value: true,
                    parser: this
                });
                // this.originalRules.push(rule);
                // this.rules.push(rule);
                this.addRule(rule);
            });
        }

        const packages: any[] = this.data.support;

        if (packages) {
            packages.forEach((p) => {
                if (!_.isArray(p.rules) || !p.rules.length) return;
                const packageName =
                    p.package && _.isArray(p.package.path)
                        ? RegoRef.convertToFullRefString(p.package.path)
                        : "";

                const rules: any[] = p.rules;
                rules.forEach((r) => {
                    const regoRule = RegoRule.parseFromData(
                        r,
                        packageName,
                        this
                    );
                    //this.originalRules.push(regoRule);
                    //this.rules.push(regoRule);
                    this.addRule(regoRule);
                });
            });
        }

        this.ruleDuplicationCheckCache = {};

        _.uniq(this.rules.map((r) => r.fullName)).forEach(
            (fullName) =>
                (this.ruleSets[fullName] = new RegoRuleSet(
                    this,
                    this.rules.filter((r) => r.fullName === fullName),
                    fullName
                ))
        );

        this.resolveAllRuleSets();
        return this.rules;
    }

    addRule(rule: RegoRule) {
        this.originalRules.push(rule);
        if (rule.isImpossible()) {
            return;
        }
        if (!this.ruleDuplicationCheckCache[rule.fullName]) {
            this.ruleDuplicationCheckCache[rule.fullName] = new Set();
        }
        const setData = this.ruleDuplicationCheckCache[rule.fullName];
        const { name, fullName, ...ruleData } = rule.toData();
        const jsonData = JSON.stringify(ruleData);
        const size = setData.size;
        setData.add(jsonData);
        if (size === setData.size) {
            return;
        }
        this.rules.push(rule);
    }

    isRefResolvable(fullName: string): boolean {
        if (this.completeRuleResults[fullName]) {
            return true;
        }
        const ruleSet = this.ruleSets[fullName];
        if (!ruleSet) {
            return false;
        }
        return ruleSet.isResolvable();
    }

    getRefValue(fullName: string): any {
        const completeResult = this.completeRuleResults[fullName];
        if (completeResult) {
            return completeResult.value;
        }
        const ruleSet = this.ruleSets[fullName];
        if (!ruleSet || !ruleSet.isResolvable()) {
            return undefined;
        }
        return ruleSet.value;
    }

    private resolveAllRuleSets() {
        while (true) {
            const unresolvedSetsNum = Object.values(this.ruleSets).filter(
                (rs) => !rs.isResolvable()
            ).length;

            if (!unresolvedSetsNum) {
                break;
            }

            Object.values(this.ruleSets).forEach((rs) => rs.evaluate());

            const newUnresolvedSetsNum = Object.values(this.ruleSets).filter(
                (rs) => !rs.isResolvable()
            ).length;

            if (
                !newUnresolvedSetsNum ||
                newUnresolvedSetsNum >= unresolvedSetsNum
            ) {
                break;
            }
        }
    }

    /**
     * Call to evaluate a rule
     *
     * @param {string} fullName
     * @returns {CompleteRuleResult}
     * @memberof OpaCompileResponseParser
     */
    evaluateRule(fullName: string): CompleteRuleResult | null {
        if (this.completeRuleResults[fullName]) {
            return this.completeRuleResults[fullName];
        }
        const ruleSet = this.ruleSets[fullName];
        if (!ruleSet) {
            return null;
        }
        if (ruleSet.isResolvable()) {
            return {
                fullName,
                name: ruleSet.name,
                value: ruleSet.value,
                isCompleteEvaluated: true
            };
        } else {
            return {
                fullName,
                name: ruleSet.name,
                value: undefined,
                isCompleteEvaluated: false,
                residualRules: ruleSet.getResidualRules()
            };
        }
    }

    /**
     * Shortcut to evalute query result directly
     *
     * @returns {CompleteRuleResult}
     * @memberof OpaCompileResponseParser
     */
    evaluate(): CompleteRuleResult {
        return this.evaluateRule(this.pseudoQueryRuleName);
    }

    /**
     * evaluate a rule and returned as human readable string
     *
     * @param {string} fullName
     * @returns {string}
     * @memberof OpaCompileResponseParser
     */
    evaluateRuleAsHumanReadableString(fullName: string): string {
        const result = this.evaluateRule(fullName);
        if (result === null) return "null";
        if (result.isCompleteEvaluated) {
            if (typeof result.value === "undefined") {
                return "undefined";
            }
            return value2String(result.value);
        }
        let parts = result.residualRules.map((r) => r.toHumanReadableString());
        if (parts.length > 1) {
            parts = parts.map((p) => `( ${p} )`);
        }
        return parts.join("\nOR\n");
    }

    /**
     * Shortcut to evalute query result directly and returned as human readable string
     *
     * @returns {string}
     * @memberof OpaCompileResponseParser
     */
    evaluateAsHumanReadableString(): string {
        return this.evaluateRuleAsHumanReadableString(this.pseudoQueryRuleName);
    }

    reportWarns(msg: string) {
        this.warns.push(msg);
        this.hasWarns = true;
    }
}

export function unknown2Ref(unknown: string) {
    const prefix = unknown.replace(/^input\./, "");
    return `data.partial.${prefix}`;
}
