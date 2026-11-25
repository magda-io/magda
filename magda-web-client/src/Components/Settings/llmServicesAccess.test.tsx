import {
    canManageLlmAccess,
    canReadAccessProfiles,
    LLM_ACCESS_READ_OPERATION,
    LLM_ACCESS_UPDATE_OPERATION
} from "./llmServicesAccess";

jest.mock("Components/ValidateUser", () => () => null);

const ADMIN_ROLE_ID = "00000000-0000-0003-0000-000000000000";

function permission(uri: string, constraint: Record<string, boolean> = {}) {
    return {
        id: `${uri}-${Object.keys(constraint).join("-")}`,
        userOwnershipConstraint: false,
        orgUnitOwnershipConstraint: false,
        preAuthorisedConstraint: false,
        allowExemption: false,
        operations: [{ id: uri, uri }],
        ...constraint
    };
}

function user(permissions: any[], roleIds: string[] = []): any {
    return {
        id: "00000000-0000-4000-8000-000000000b0b",
        roles: roleIds.map((id) => ({ id })),
        permissions
    };
}

describe("canManageLlmAccess (AUTH-3 navigation hint)", () => {
    it("allows an unconstrained permission", () => {
        expect(
            canReadAccessProfiles(user([permission(LLM_ACCESS_READ_OPERATION)]))
        ).toBe(true);
        expect(
            canReadAccessProfiles(
                user([
                    permission(LLM_ACCESS_READ_OPERATION, {
                        allowExemption: true
                    })
                ])
            )
        ).toBe(true);
    });

    it("ignores owner, org unit and pre-authorised permissions", () => {
        // acceptance case 1: only constrained grants → no Access Profiles tab
        const constrained = user([
            permission(LLM_ACCESS_READ_OPERATION, {
                userOwnershipConstraint: true
            }),
            permission(LLM_ACCESS_READ_OPERATION, {
                orgUnitOwnershipConstraint: true
            }),
            permission(LLM_ACCESS_READ_OPERATION, {
                preAuthorisedConstraint: true
            })
        ]);
        expect(canReadAccessProfiles(constrained)).toBe(false);
    });

    it("checks the operation asked for", () => {
        const reader = user([permission(LLM_ACCESS_READ_OPERATION)]);
        expect(canManageLlmAccess(LLM_ACCESS_UPDATE_OPERATION, reader)).toBe(
            false
        );
        // invoke never shows management pages
        expect(
            canReadAccessProfiles(user([permission("llm/access/invoke")]))
        ).toBe(false);
    });

    it("allows administrators and denies anonymous users", () => {
        expect(canReadAccessProfiles(user([], [ADMIN_ROLE_ID]))).toBe(true);
        expect(
            canReadAccessProfiles({
                ...user([permission(LLM_ACCESS_READ_OPERATION)]),
                id: ""
            })
        ).toBe(false);
        expect(canReadAccessProfiles(undefined)).toBe(false);
    });
});
