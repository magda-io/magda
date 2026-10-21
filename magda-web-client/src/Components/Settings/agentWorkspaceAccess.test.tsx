import { canAccessAgentWorkspace } from "./agentWorkspaceAccess";

jest.mock("Components/ValidateUser", () => () => null);

const ADMIN_ROLE_ID = "00000000-0000-0003-0000-000000000000";

function user(overrides: Record<string, unknown> = {}) {
    return {
        id: "00000000-0000-4000-8000-000000000b0b",
        roles: [{ id: "00000000-0000-0002-0000-000000000000" }],
        permissions: [],
        ...overrides
    } as any;
}

function permission(uri: string) {
    return { id: uri, operations: [{ id: uri, uri }] };
}

describe("canAccessAgentWorkspace", () => {
    it("requires the agentWorkspace/access operation", () => {
        expect(canAccessAgentWorkspace(user())).toBe(false);
        expect(
            canAccessAgentWorkspace(
                user({ permissions: [permission("agentWorkspace/access")] })
            )
        ).toBe(true);
    });

    it("does not treat Agent Skill permissions as Workspace access", () => {
        expect(
            canAccessAgentWorkspace(
                user({
                    permissions: [
                        permission("object/agentSkill/system/read"),
                        permission("object/agentSkill/user/read"),
                        permission("object/agentSkill/user/update")
                    ]
                })
            )
        ).toBe(false);
    });

    it("keeps the administrator hint and rejects anonymous users", () => {
        expect(
            canAccessAgentWorkspace(user({ roles: [{ id: ADMIN_ROLE_ID }] }))
        ).toBe(true);
        expect(
            canAccessAgentWorkspace(
                user({
                    id: "",
                    permissions: [permission("agentWorkspace/access")]
                })
            )
        ).toBe(false);
        expect(canAccessAgentWorkspace(undefined)).toBe(false);
    });
});
