import "mocha";
import { expect } from "chai";
import AuthDecision from "../opa/AuthDecision.js";
import AuthDecisionQueryClient, {
    AuthDecisionReqConfig
} from "../opa/AuthDecisionQueryClient.js";
import { requireUnconditionalAuthDecision } from "../authorization-api/authMiddleware.js";

describe("Unconditional only auth decisions", () => {
    describe("AuthDecision", () => {
        it("should allow a decision with residual rules omitted (e.g. requested with `unconditionalOnly`)", () => {
            const decision = AuthDecision.fromJson({ hasResidualRules: true });
            expect(decision.hasResidualRules).to.be.equal(true);
            expect(() =>
                decision.toAspectQueryGroups(["input.object"])
            ).to.throw(/it has no residual rules/);
        });

        it("should still reject an empty residual rule list", () => {
            expect(() =>
                AuthDecision.fromJson({
                    hasResidualRules: true,
                    residualRules: []
                })
            ).to.throw(/residualRules must have at least one item/);
        });
    });

    describe("requireUnconditionalAuthDecision", () => {
        /**
         * Run the middleware with a fake request & response.
         * Returns the response status, or 200 when the middleware calls `next`.
         */
        async function runMiddleware(
            config:
                | AuthDecisionReqConfig
                | (() => Promise<AuthDecisionReqConfig>),
            decision: AuthDecision,
            receivedConfigs: AuthDecisionReqConfig[]
        ): Promise<number> {
            const client = ({
                getAuthDecision: async (config: AuthDecisionReqConfig) => {
                    receivedConfigs.push(config);
                    return decision;
                }
            } as unknown) as AuthDecisionQueryClient;
            return new Promise((resolve) => {
                const res: any = {
                    locals: {},
                    status: (code: number) => ({
                        send: () => resolve(code)
                    })
                };
                const req: any = { get: (): string => undefined };
                requireUnconditionalAuthDecision(client, config)(req, res, () =>
                    resolve(200)
                );
            });
        }

        for (const [desc, config] of [
            ["a config object", { operationUri: "object/record/delete" }],
            [
                "a config function",
                async () => ({ operationUri: "object/record/delete" })
            ]
        ] as const) {
            it(`should only ask whether the decision is unconditional, with ${desc}`, async () => {
                const receivedConfigs: AuthDecisionReqConfig[] = [];
                const status = await runMiddleware(
                    config as any,
                    AuthDecision.fromJson({ hasResidualRules: true }),
                    receivedConfigs
                );
                expect(status).to.be.equal(403);
                expect(receivedConfigs).to.deep.equal([
                    {
                        operationUri: "object/record/delete",
                        unconditionalOnly: true
                    }
                ]);
            });
        }

        it("should pass when the decision is unconditional true", async () => {
            const receivedConfigs: AuthDecisionReqConfig[] = [];
            const status = await runMiddleware(
                { operationUri: "object/record/delete" },
                AuthDecision.fromJson({
                    hasResidualRules: false,
                    result: true
                }),
                receivedConfigs
            );
            expect(status).to.be.equal(200);
        });
    });
});
