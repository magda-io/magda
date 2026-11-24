import assert from "node:assert/strict";
import {
    ProfileValidationError,
    validateAllowedModels,
    validateProfileFields,
    validateTokenLimit
} from "../profiles/validation.js";

describe("profile validation", () => {
    describe("validateAllowedModels (DATA-2)", () => {
        it('accepts distinct exact aliases, or exactly ["*"]', () => {
            assert.deepEqual(validateAllowedModels(["a", "b"]), ["a", "b"]);
            assert.deepEqual(validateAllowedModels(["*"]), ["*"]);
        });

        it("rejects empty, blank, padded, duplicate and mixed wildcard values", () => {
            for (const bad of [
                [],
                "a",
                [""],
                [" "],
                [" a"],
                ["a", "a"],
                ["*", "a"],
                [1]
            ]) {
                assert.throws(
                    () => validateAllowedModels(bad),
                    ProfileValidationError,
                    JSON.stringify(bad)
                );
            }
        });

        it('checks explicit aliases against the deployment allowlist, but not "*"', () => {
            const known = new Set(["a"]);
            assert.deepEqual(validateAllowedModels(["a"], known), ["a"]);
            assert.deepEqual(validateAllowedModels(["*"], known), ["*"]);
            assert.throws(
                () => validateAllowedModels(["b"], known),
                /not available/
            );
        });
    });

    describe("validateTokenLimit (DATA-3)", () => {
        it("accepts null, zero and positive safe integers", () => {
            assert.equal(validateTokenLimit(null, "x"), null);
            assert.equal(validateTokenLimit(undefined, "x"), null);
            assert.equal(validateTokenLimit(0, "x"), 0);
            assert.equal(
                validateTokenLimit(Number.MAX_SAFE_INTEGER, "x"),
                Number.MAX_SAFE_INTEGER
            );
        });

        it("rejects negative, fractional, unsafe and non-number values", () => {
            for (const bad of [
                -1,
                1.5,
                Number.MAX_SAFE_INTEGER + 1,
                "10",
                NaN
            ]) {
                assert.throws(
                    () => validateTokenLimit(bad, "x"),
                    ProfileValidationError,
                    String(bad)
                );
            }
        });
    });

    describe("validateProfileFields", () => {
        it("normalises a minimal profile with defaults", () => {
            assert.deepEqual(
                validateProfileFields({
                    name: "  Default  ",
                    allowedModels: ["*"]
                }),
                {
                    name: "Default",
                    description: null,
                    allowedModels: ["*"],
                    enabled: true,
                    orgUnitId: null,
                    constraintExemption: false,
                    allowedDailyTokens: null,
                    allowedWeeklyTokens: null,
                    allowedMonthlyTokens: null
                }
            );
        });

        it("rejects internal fields that clients can't set", () => {
            for (const field of [
                "id",
                "state",
                "usePermissionId",
                "revision",
                "ownerId"
            ]) {
                assert.throws(
                    () =>
                        validateProfileFields({
                            name: "x",
                            allowedModels: ["*"],
                            [field]: "value"
                        }),
                    /Unsupported field/,
                    field
                );
            }
        });

        it("rejects a malformed org unit ID and non-boolean flags", () => {
            assert.throws(
                () =>
                    validateProfileFields({
                        name: "x",
                        allowedModels: ["*"],
                        orgUnitId: "finance"
                    }),
                /orgUnitId/
            );
            assert.throws(
                () =>
                    validateProfileFields({
                        name: "x",
                        allowedModels: ["*"],
                        constraintExemption: "yes"
                    }),
                /constraintExemption/
            );
        });
    });
});
