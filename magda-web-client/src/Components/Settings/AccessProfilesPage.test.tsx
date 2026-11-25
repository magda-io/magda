import React from "react";
import { createRoot, Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { MemoryRouter, Route } from "react-router-dom";

jest.mock("react", () =>
    jest.requireActual(
        require.resolve("react", {
            paths: [require.resolve("react-dom")]
        })
    )
);

jest.mock("../../config", () => ({ config: { baseUrl: "/" } }));
jest.mock("./SideNavigation", () => () => null);
jest.mock("./Breadcrumb", () => ({ items }: any) => (
    <div data-testid="breadcrumb">
        {items.map((item: any) => item.title).join(" / ")}
    </div>
));
jest.mock("api-clients/OrgUnitApis", () => ({
    getOrgUnitById: async (id: string) =>
        id.endsWith("f1") ? { id, name: `Unit ${id.slice(-2)}` } : undefined
}));
jest.mock("./AccessProfileGeneralForm", () => (props: any) => (
    <div data-testid="general-form">
        {props.profile ? `edit ${props.profile.name}` : "create"}
        {props.canEdit ? " editable" : " read-only"}
        {props.canDelete ? " deletable" : ""}
    </div>
));
jest.mock("./AccessProfileRolesPanel", () => (props: any) => (
    <div data-testid="roles-panel">
        roles of {props.profileName}
        {props.canEdit ? " editable" : " read-only"}
    </div>
));
jest.mock("./reportInfo", () => jest.fn());
jest.mock("rsuite/Button", () => require("./testUtils/rsuiteMocks").Button);
jest.mock("rsuite/Input", () => require("./testUtils/rsuiteMocks").Input);
jest.mock(
    "rsuite/InputGroup",
    () => require("./testUtils/rsuiteMocks").InputGroup
);
jest.mock("rsuite/Message", () => require("./testUtils/rsuiteMocks").Message);
jest.mock("rsuite/Loader", () => require("./testUtils/rsuiteMocks").Loader);
jest.mock("rsuite/Panel", () => require("./testUtils/rsuiteMocks").Panel);
jest.mock("rsuite/Nav", () => require("./testUtils/rsuiteMocks").Nav);
jest.mock(
    "rsuite/Pagination",
    () => require("./testUtils/rsuiteMocks").Pagination
);
jest.mock("rsuite/Table", () => require("./testUtils/rsuiteMocks").Table);
jest.mock(
    "rsuite/SelectPicker",
    () => require("./testUtils/rsuiteMocks").SelectPicker
);

let mockUserState: any;
jest.mock("react-redux", () => ({
    useSelector: (selector: any) => selector(mockUserState)
}));

const mockList = jest.fn();
const mockGet = jest.fn();
jest.mock("api-clients/LlmServicesApis", () => {
    const actual = jest.requireActual("api-clients/LlmServicesApis");
    return {
        ...actual,
        listAccessProfiles: (...args: any[]) => mockList(...args),
        getAccessProfile: (...args: any[]) => mockGet(...args)
    };
});

// eslint-disable-next-line import/first
import AccessProfilesPage, { ACCESS_PROFILES_PATH } from "./AccessProfilesPage";
// eslint-disable-next-line import/first
import AccessProfilePage from "./AccessProfilePage";
// eslint-disable-next-line import/first
import { LlmServicesApiError } from "api-clients/LlmServicesApis";

const orgUnitId = "00000000-0000-4000-8000-0000000000f1";

function profile(overrides: Record<string, any> = {}) {
    return {
        id: "3b1eceed-603e-4173-91ff-a3475c75b25b",
        name: "Demo: Public default model",
        description: null,
        allowedModels: ["*"],
        enabled: true,
        orgUnitId: null,
        constraintExemption: true,
        usePermissionId: "00000000-0000-4000-8000-0000000000aa",
        allowedDailyTokens: null,
        allowedWeeklyTokens: null,
        allowedMonthlyTokens: null,
        revision: 1,
        createdBy: null,
        updatedBy: null,
        createdAt: "2026-11-25T01:00:00.000Z",
        updatedAt: "2026-11-25T01:00:00.000Z",
        ...overrides
    };
}

function signedIn(operations: string[]) {
    mockUserState = {
        userManagement: {
            user: {
                id: "00000000-0000-4000-8000-000000000b0b",
                roles: [],
                permissions: operations.map((uri) => ({
                    id: uri,
                    userOwnershipConstraint: false,
                    orgUnitOwnershipConstraint: false,
                    preAuthorisedConstraint: false,
                    operations: [{ id: uri, uri }]
                }))
            }
        }
    };
}

const MANAGER = [
    "llm/access/read",
    "llm/access/create",
    "llm/access/update",
    "llm/access/delete"
];

let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
    (global as any).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
    mockList.mockReset();
    mockGet.mockReset();
    signedIn(MANAGER);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(() => {
    act(() => root.unmount());
    container.remove();
});

async function flush() {
    await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
    });
}

let currentPath = "";

async function render(path: string) {
    // a fresh root per render, so the router starts at `path`
    act(() => root.unmount());
    root = createRoot(container);
    act(() => {
        root.render(
            <MemoryRouter initialEntries={[path]}>
                <Route
                    exact
                    path={ACCESS_PROFILES_PATH}
                    component={AccessProfilesPage}
                />
                <Route
                    exact
                    path={[
                        `${ACCESS_PROFILES_PATH}/:profileId`,
                        `${ACCESS_PROFILES_PATH}/:profileId/roles`
                    ]}
                    component={AccessProfilePage}
                />
                <Route
                    path="*"
                    render={({ location }) => {
                        currentPath = location.pathname;
                        return null;
                    }}
                />
            </MemoryRouter>
        );
    });
    await flush();
}

function button(label: string) {
    const match = Array.from(
        container.querySelectorAll<HTMLButtonElement>("button")
    ).find(
        (item) =>
            item.textContent?.trim() === label ||
            item.getAttribute("aria-label") === label
    );
    if (!match) throw new Error(`No button ${label}`);
    return match;
}

async function click(element: HTMLElement) {
    act(() => element.click());
    await flush();
}

describe("AccessProfilesPage", () => {
    it("lists name, models, audience, limits and status", async () => {
        mockList.mockResolvedValue({
            items: [
                profile(),
                profile({
                    id: "3b1eceed-603e-4173-91ff-a3475c75b25c",
                    name: "Finance",
                    allowedModels: ["magda-agent-default", "magda-fast"],
                    orgUnitId,
                    constraintExemption: false,
                    allowedDailyTokens: 100000,
                    allowedWeeklyTokens: 2500000,
                    allowedMonthlyTokens: 0,
                    enabled: false
                }),
                profile({
                    id: "3b1eceed-603e-4173-91ff-a3475c75b25d",
                    name: "Both",
                    orgUnitId,
                    constraintExemption: true
                }),
                profile({
                    id: "3b1eceed-603e-4173-91ff-a3475c75b25e",
                    name: "Team",
                    constraintExemption: false
                })
            ],
            total: 4
        });
        await render(ACCESS_PROFILES_PATH);
        expect(mockList).toHaveBeenCalledWith({
            q: "",
            offset: 0,
            limit: 10
        });
        const rows = Array.from(container.querySelectorAll("tr")).map((row) =>
            Array.from(row.querySelectorAll("td")).map(
                (cell) => cell.textContent
            )
        );
        expect(rows).toEqual([
            [
                "Demo: Public default model",
                "All available models (*)",
                "Public",
                "Unlimited",
                "Unlimited",
                "Unlimited",
                "Enabled"
            ],
            [
                "Finance",
                "magda-agent-default, magda-fast",
                "Unit f1",
                "100K",
                "2.5M",
                "0",
                "Disabled"
            ],
            [
                "Both",
                "All available models (*)",
                "Unit f1 + Public",
                "Unlimited",
                "Unlimited",
                "Unlimited",
                "Enabled"
            ],
            [
                "Team",
                "All available models (*)",
                "Roles only",
                "Unlimited",
                "Unlimited",
                "Unlimited",
                "Enabled"
            ]
        ]);
        expect(
            container.querySelector(
                `a[href="${ACCESS_PROFILES_PATH}/3b1eceed-603e-4173-91ff-a3475c75b25b"]`
            )?.textContent
        ).toBe("Demo: Public default model");
        expect(container.textContent).toContain(
            "Limits are tokens per user and per model. A blank limit means no limit."
        );
    });

    it("shows the org unit ID when its name can't be read", async () => {
        const hidden = "00000000-0000-4000-8000-0000000000c9";
        mockList.mockResolvedValue({
            items: [profile({ orgUnitId: hidden, constraintExemption: false })],
            total: 1
        });
        await render(ACCESS_PROFILES_PATH);
        expect(container.querySelectorAll("td")[2].textContent).toBe(
            `Org unit ${hidden}`
        );
    });

    it("searches by name on the server and pages", async () => {
        mockList.mockResolvedValue({ items: [profile()], total: 1 });
        await render(ACCESS_PROFILES_PATH);
        const input = container.querySelector<HTMLInputElement>(
            "#access-profiles-search"
        )!;
        expect(
            container.querySelector('label[for="access-profiles-search"]')
                ?.textContent
        ).toBe("Search profiles by name");
        Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value"
        )!.set!.call(input, " Demo ");
        act(() => {
            input.dispatchEvent(new Event("input", { bubbles: true }));
        });
        await click(button("Search"));
        expect(mockList).toHaveBeenLastCalledWith({
            q: "Demo",
            offset: 0,
            limit: 10
        });
    });

    it("shows Create profile only with llm/access/create", async () => {
        mockList.mockResolvedValue({ items: [profile()], total: 1 });
        await render(ACCESS_PROFILES_PATH);
        expect(
            container.querySelector(`a[href="${ACCESS_PROFILES_PATH}/new"]`)
                ?.textContent
        ).toBe("Create profile");

        signedIn(["llm/access/read"]);
        await render(ACCESS_PROFILES_PATH);
        expect(
            container.querySelector(`a[href="${ACCESS_PROFILES_PATH}/new"]`)
        ).toBeNull();
    });

    it("shows empty and error states", async () => {
        mockList.mockResolvedValue({ items: [], total: 0 });
        await render(ACCESS_PROFILES_PATH);
        expect(container.textContent).toContain(
            "There are no access profiles yet. Create one to give people access to LLM models."
        );

        mockList.mockRejectedValue(
            new LlmServicesApiError("denied", 403, "llm_access_denied")
        );
        await render(ACCESS_PROFILES_PATH);
        expect(container.textContent).toContain(
            "You don't have permission to do this."
        );
        expect(button("Retry")).toBeTruthy();
    });
});

describe("AccessProfilePage", () => {
    it("shows General, then Roles with access", async () => {
        mockGet.mockResolvedValue(profile());
        await render(`${ACCESS_PROFILES_PATH}/${profile().id}`);
        expect(mockGet).toHaveBeenCalledWith(profile().id);
        expect(
            container.querySelector('[data-testid="breadcrumb"]')?.textContent
        ).toBe("LLM Access Profiles / Profile: Demo: Public default model");
        expect(
            container.querySelector('[data-testid="general-form"]')?.textContent
        ).toBe("edit Demo: Public default model editable deletable");

        await click(button("Roles with access"));
        expect(currentPath).toBe(
            `${ACCESS_PROFILES_PATH}/${profile().id}/roles`
        );
        expect(
            container.querySelector('[data-testid="roles-panel"]')?.textContent
        ).toBe("roles of Demo: Public default model editable");
    });

    it("is read-only for a reader", async () => {
        signedIn(["llm/access/read"]);
        mockGet.mockResolvedValue(profile());
        await render(`${ACCESS_PROFILES_PATH}/${profile().id}/roles`);
        expect(
            container.querySelector('[data-testid="roles-panel"]')?.textContent
        ).toBe("roles of Demo: Public default model read-only");
    });

    it("shows the create form at /new", async () => {
        await render(`${ACCESS_PROFILES_PATH}/new`);
        expect(mockGet).not.toHaveBeenCalled();
        expect(
            container.querySelector('[data-testid="general-form"]')?.textContent
        ).toBe("create editable");
        expect(container.textContent).not.toContain("Roles with access");

        signedIn(["llm/access/read"]);
        await render(`${ACCESS_PROFILES_PATH}/new`);
        expect(container.textContent).toContain(
            "You don't have permission to create access profiles."
        );
    });

    it("says when a profile doesn't exist", async () => {
        mockGet.mockRejectedValue(new LlmServicesApiError("gone", 404));
        await render(`${ACCESS_PROFILES_PATH}/${profile().id}`);
        expect(container.textContent).toContain("Profile not found");
        expect(container.textContent).toContain("Back to access profiles");
    });

    it("shows the API's denial for a deep link", async () => {
        // acceptance case 1: the API denies a constrained grant
        mockGet.mockRejectedValue(
            new LlmServicesApiError("denied", 403, "llm_access_denied")
        );
        await render(`${ACCESS_PROFILES_PATH}/${profile().id}`);
        expect(container.textContent).toContain("Unable to load the profile");
        expect(container.textContent).toContain(
            "You don't have permission to do this."
        );
        expect(container.querySelector('[data-testid="general-form"]')).toBe(
            null
        );
    });
});
