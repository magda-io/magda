import React from "react";
import { createRoot, Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { MemoryRouter } from "react-router-dom";

jest.mock("react", () =>
    jest.requireActual(
        require.resolve("react", {
            paths: [require.resolve("react-dom")]
        })
    )
);

jest.mock("../../config", () => ({
    config: { featureFlags: { agentWorkspace: true } }
}));

jest.mock("../../helpers/popupUtils", () => ({
    showSideNav: () => true,
    getUrlWithPopUpQueryString: (path: string) => path
}));

jest.mock("../Common/CommonLink", () => {
    const { Link } = require("react-router-dom");
    return ({ to, children, className }: any) => (
        <Link to={to} className={className}>
            {children}
        </Link>
    );
});

jest.mock("Components/ValidateUser", () => () => null);

let mockUserState: any;
jest.mock("react-redux", () => ({
    useSelector: (selector: any) => selector(mockUserState)
}));

// eslint-disable-next-line import/first
import SideNavigation, { isMenuItemAllowed } from "./SideNavigation";

const ADMIN_ROLE_ID = "00000000-0000-0003-0000-000000000000";

function user(operations: string[], roleIds: string[] = []) {
    return {
        id: "00000000-0000-4000-8000-000000000b0b",
        roles: roleIds.map((id) => ({ id })),
        permissions: operations.map((uri) => ({
            id: uri,
            operations: [{ id: uri, uri }]
        }))
    };
}

let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
    (global as any).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(() => {
    act(() => root.unmount());
    container.remove();
});

function render(currentUser: any, path = "/settings/account") {
    mockUserState = {
        userManagement: {
            user: currentUser,
            isFetchingWhoAmI: false,
            whoAmIError: null
        }
    };
    // A fresh root per render so group expansion state never carries over.
    act(() => root.unmount());
    root = createRoot(container);
    act(() => {
        root.render(
            <MemoryRouter initialEntries={[path]}>
                <SideNavigation />
            </MemoryRouter>
        );
    });
}

function groupTitles() {
    return Array.from(container.querySelectorAll(".sidenav-group-title")).map(
        (item) => item.textContent
    );
}

function links() {
    return Array.from(container.querySelectorAll("a[href]")).map((item) =>
        item.getAttribute("href")
    );
}

function expandAgentWorkspace() {
    const title = Array.from(
        container.querySelectorAll<HTMLElement>(".sidenav-group-title")
    ).find((item) => item.textContent === "Agent Workspace");
    act(() => title?.click());
}

describe("isMenuItemAllowed", () => {
    const item = {
        path: "/x",
        title: "X",
        icon: <span />,
        requireAnyOperationUris: ["a/read", "b/read"]
    };

    it("requires at least one of requireAnyOperationUris", () => {
        expect(isMenuItemAllowed(item, [], [])).toBe(false);
        expect(isMenuItemAllowed(item, [], ["b/read"])).toBe(true);
        expect(isMenuItemAllowed(item, [ADMIN_ROLE_ID], [])).toBe(true);
    });

    it("still requires every requireOperationUris entry", () => {
        const allOf = { ...item, requireAnyOperationUris: undefined };
        allOf.requireOperationUris = ["a/read", "b/read"];
        expect(isMenuItemAllowed(allOf as any, [], ["a/read"])).toBe(false);
        expect(isMenuItemAllowed(allOf as any, [], ["a/read", "b/read"])).toBe(
            true
        );
    });
});

describe("Agent Workspace Settings navigation", () => {
    it("is hidden without Workspace or skill permissions", () => {
        render(user([]));
        expect(groupTitles()).not.toContain("Agent Workspace");
    });

    it("shows only Open Workspace for a Workspace-only user", () => {
        render(user(["agentWorkspace/access"]));
        expandAgentWorkspace();
        expect(links()).toContain("/settings/agent-workspace");
        expect(links()).not.toContain("/settings/agent-workspace/skills");
    });

    it("shows only Agent Skills for a skill-read user without Workspace access", () => {
        for (const operation of [
            "object/agentSkill/user/read",
            "object/agentSkill/system/read"
        ]) {
            render(user([operation]));
            expect(groupTitles()).toContain("Agent Workspace");
            expandAgentWorkspace();
            expect(links()).toContain("/settings/agent-workspace/skills");
            expect(links()).not.toContain("/settings/agent-workspace");
        }
    });

    it("ignores the deprecated unsuffixed skill read operation", () => {
        render(user(["object/agentSkill/read"]));
        expect(groupTitles()).not.toContain("Agent Workspace");
    });

    it("shows both children for users with both permissions and for admins", () => {
        for (const currentUser of [
            user(["agentWorkspace/access", "object/agentSkill/user/read"]),
            user([], [ADMIN_ROLE_ID])
        ]) {
            render(currentUser);
            expandAgentWorkspace();
            expect(links()).toEqual(
                expect.arrayContaining([
                    "/settings/agent-workspace",
                    "/settings/agent-workspace/skills"
                ])
            );
            expect(links()).not.toContain(
                "/settings/agent-workspace/shared-skills"
            );
        }
    });

    it("highlights only the current child", () => {
        render(
            user(["agentWorkspace/access", "object/agentSkill/user/read"]),
            "/settings/agent-workspace/skills"
        );
        const active = Array.from(
            container.querySelectorAll("a.active")
        ).map((item) => item.getAttribute("href"));
        expect(active).toEqual(["/settings/agent-workspace/skills"]);
    });
});
