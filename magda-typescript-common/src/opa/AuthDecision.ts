import {
    AspectQueryValue,
    AspectQuery,
    AspectQueryArrayNotEmpty,
    AspectQueryExists,
    AspectQueryValueInArray,
    AspectQueryWithValue,
    AspectQueryGroup,
    AspectQueryToSqlConfig,
    AspectQueryTrue,
    AspectQueryFalse
} from "./AspectQuery";
import SQLSyntax, { sqls } from "sql-syntax";

type PlainObject = {
    [key: string]: any;
};
export default class AuthDecision {
    readonly hasResidualRules: boolean;
    readonly result?: any;
    readonly residualRules?: ConciseRule[];
    readonly hasWarns: boolean;
    readonly warns: string[];
    readonly unknowns?: string[];

    constructor(
        hasResidualRules: boolean,
        residualRules?: ConciseRule[],
        result?: any,
        hasWarns: boolean = false,
        warns: string[] = [],
        unknowns?: string[]
    ) {
        if (typeof hasResidualRules !== "boolean") {
            throw new Error(
                "Failed to create AuthDecision: invalid hasResidualRules type"
            );
        }
        if (hasResidualRules && !residualRules?.length) {
            throw new Error(
                "Failed to create AuthDecision: residualRules must have at least one item when hasResidualRules == true"
            );
        }
        this.hasResidualRules = hasResidualRules;
        this.result = result;
        this.residualRules = residualRules;
        this.hasWarns = hasWarns;
        this.warns = warns;
        this.unknowns = unknowns;
    }

    static fromJson(data: PlainObject) {
        return new AuthDecision(
            data?.hasResidualRules,
            data?.residualRules?.map((item: any) => ConciseRule.fromJson(item)),
            data?.result,
            data?.hasWarns ? true : false,
            data?.warns,
            data?.unknowns
        );
    }

    toAspectQueryGroups(prefixes: string[]): AspectQueryGroup[] {
        if (this.hasResidualRules) {
            return this.residualRules.map((item) =>
                item.toAspectQueryGroup(prefixes)
            );
        } else {
            if (isTrueEquivalent(this.result)) {
                // unconditional true
                return [new AspectQueryGroup([new AspectQueryTrue()])];
            } else {
                return [new AspectQueryGroup([new AspectQueryFalse()])];
            }
        }
    }

    toSql(config: AspectQueryToSqlConfig): SQLSyntax {
        return SQLSyntax.joinWithOr(
            this.toAspectQueryGroups(config.prefixes).map((item) =>
                item.toSql(config)
            )
        ).roundBracket();
    }
}

export function isTrueEquivalent(value: any) {
    const typeStr = typeof value;
    if (typeStr === "boolean") {
        return value;
    } else if (typeStr === "undefined") {
        return false;
    } else if (typeof value?.length !== "undefined") {
        return !!value.length;
    } else {
        return !!value;
    }
}

export const UnconditionalTrueDecision = new AuthDecision(
    false,
    undefined,
    true
);

export const UnconditionalFalseDecision = new AuthDecision(
    false,
    undefined,
    false
);

export class ConciseRule {
    readonly default: boolean;
    readonly value: any;
    readonly fullName: string;
    readonly name: string;
    readonly expressions: ConciseExpression[];

    constructor(
        fullName: string,
        name: string,
        value: any,
        expressions: ConciseExpression[],
        isDefault: boolean = false
    ) {
        if (!isDefault && !expressions?.length) {
            throw new Error(
                "Invalid ConciseRule data: it must contain at least one ConciseExpression item unless it's a default rule."
            );
        }
        this.default = isDefault ? true : false;
        this.fullName = fullName;
        this.name = name;
        this.value = value;
        this.expressions = expressions?.length ? expressions : [];
    }

    static fromJson(data: PlainObject) {
        return new ConciseRule(
            data?.fullName,
            data?.name,
            data?.value,
            data?.expressions?.map((item: any) =>
                ConciseExpression.fromJson(item)
            )
        );
    }

    toAspectQueryGroup(prefixes: string[]): AspectQueryGroup {
        return new AspectQueryGroup(
            this.expressions?.map((item) => item.toAspectQuery(prefixes)),
            true,
            !isTrueEquivalent(this.value)
        );
    }
}

export class ConciseExpression {
    readonly negated: boolean;
    readonly operator?: string;
    readonly operands: ConciseOperand[];

    constructor(
        operands: ConciseOperand[],
        operator?: string,
        negated = false
    ) {
        this.negated = negated ? true : false;
        this.operands = operands;
        this.operator = operator;
        if (!this.operands?.length) {
            throw new Error(
                "invalid ConciseExpression data: it must have at least one operand."
            );
        }
        if (this.operands?.length > 1 && typeof operator !== "string") {
            throw new Error(
                "invalid ConciseExpression data: when operands number > 1, operator must be a valid string value."
            );
        }
    }

    static fromJson(data: PlainObject) {
        return new ConciseExpression(
            data?.operands?.map((item: any) => ConciseOperand.fromJson(item)),
            data?.operator,
            data?.negated
        );
    }

    getSqlOperator(): SQLSyntax {
        switch (this.operator) {
            case "!=":
                return sqls`!=`;
            case "=":
                return sqls`=`;
            case ">":
                return sqls`>`;
            case "<":
                return sqls`<`;
            case ">=":
                return sqls`>=`;
            case "<=":
                return sqls`<=`;
            default:
                throw new Error(
                    `Failed to convert auth decision operator to SQL operator: unsupported operator: ${this.operator}`
                );
        }
    }

    toAspectQuery(prefixes: string[]): AspectQuery {
        if (this.operands?.length == 1) {
            const [
                aspectId,
                path,
                isCollection
            ] = this.operands[0].extractAspectIdAndPath(prefixes);
            if (isCollection) {
                return new AspectQueryArrayNotEmpty(
                    aspectId,
                    path,
                    this.negated
                );
            } else {
                return new AspectQueryExists(aspectId, path, this.negated);
            }
        } else if (this.operands?.length == 2) {
            const refOperand = this.operands.find((item) => item.isRef);
            const valOperand = this.operands.find((item) => !item.isRef);
            if (!valOperand) {
                throw new Error(
                    "Failed to convert auth decision expression to AspectQuery: " +
                        `expression with both terms are references is currently not supported. Expression: ${this}`
                );
            }

            if (!refOperand) {
                // it's unlikely both terms are values as our decision API has already done the evaluation for this case.
                throw new Error(
                    "Failed to convert auth decision expression to AspectQuery: " +
                        `Terms shouldn't be both value. Expression: ${this}`
                );
            }

            const [
                aspectId,
                path,
                isCollection
            ] = refOperand.extractAspectIdAndPath(prefixes);

            if (isCollection && this.operator != "=") {
                throw new Error(
                    "Failed to convert auth decision expression to AspectQuery: " +
                        `Only \`=\` operator is supported for collection reference. Expression: ${this}`
                );
            }

            if (isCollection && this.operator == "=") {
                return new AspectQueryValueInArray(
                    valOperand.toAspectQueryValue(),
                    aspectId,
                    path,
                    this.negated
                );
            } else {
                return new AspectQueryWithValue(
                    valOperand.toAspectQueryValue(),
                    this.getSqlOperator(),
                    this.operands[0].isRef,
                    aspectId,
                    path,
                    this.negated
                );
            }
        } else {
            throw new Error(
                `Failed to convert auth decision expression to AspectQuery: more than 2 operands found. Expression: ${this}`
            );
        }
    }
}

export class ConciseOperand {
    isRef: boolean;
    value: any;

    constructor(isRef: boolean, value: any) {
        if (typeof isRef !== "boolean") {
            throw new Error(
                "Invalid ConciseOperand data: isRef must be a boolean value."
            );
        }
        this.isRef = isRef;
        if (isRef && typeof value !== "string") {
            throw new Error(
                "Invalid ConciseOperand data: when `isRef`== true, `value` must be a string value (ref string)."
            );
        }
        this.value = value;
    }

    static fromJson(data: any) {
        return new ConciseOperand(data?.isRef, data?.value);
    }

    refString() {
        if (!this.isRef) {
            throw new Error("Cannot convert non-ref term to a ref string");
        } else {
            if (typeof this.value === "string") {
                return this.value;
            } else {
                throw new Error(
                    `ref term has non-string type value: ${this.value}`
                );
            }
        }
    }

    isCollectionRef() {
        return this.refString().endsWith("[_]");
    }

    refStringWithoutPrefixes(prefixes: string[]): string {
        const sortedPrefixes = prefixes.sort((a, b) => b.length - a.length);
        return sortedPrefixes.reduce((ref, prefix) => {
            if (ref.startsWith(prefix)) {
                return ref.substring(prefix.length);
            } else {
                return ref;
            }
        }, this.refString());
    }

    extractAspectIdAndPath(prefixes: string[]): [string, string[], boolean] {
        // make it work for both "input.object.record" & "input.object.record." prefixe input
        // we remove the first leading `.` char (if any)
        let ref = this.refStringWithoutPrefixes(prefixes).replace(/^\./, "");
        const isCollection = this.isCollectionRef();
        if (isCollection) {
            ref = ref.replace(/\[_\]$/, "");
        }
        const parts = ref.split(".").filter((item) => item);
        if (parts.length < 2) {
            return [ref, [], isCollection];
        } else {
            return [parts[0], parts.slice(1, parts.length), isCollection];
        }
    }

    toAspectQueryValue(): AspectQueryValue {
        if (this.isRef) {
            throw new Error(
                `Attempt to covert reference \`Operand\` to \`AspectQueryValue\`: ${this}`
            );
        }
        return new AspectQueryValue(this.value);
    }
}
