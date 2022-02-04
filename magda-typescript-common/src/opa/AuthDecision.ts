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
        this.hasResidualRules = hasResidualRules;
        this.result = result;
        this.residualRules = residualRules;
        this.hasWarns = hasWarns;
        this.warns = warns;
        this.unknowns = unknowns;
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

type ConciseRule = {};
