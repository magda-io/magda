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

jest.mock("../../config", () => ({ config: { baseUrl: "/" } }));
jest.mock("rsuite/Button", () => require("./testUtils/rsuiteMocks").Button);
jest.mock("rsuite/Input", () => require("./testUtils/rsuiteMocks").Input);
jest.mock(
    "rsuite/InputGroup",
    () => require("./testUtils/rsuiteMocks").InputGroup
);
jest.mock("rsuite/Message", () => require("./testUtils/rsuiteMocks").Message);
jest.mock("rsuite/Loader", () => require("./testUtils/rsuiteMocks").Loader);
jest.mock("rsuite/Modal", () => require("./testUtils/rsuiteMocks").Modal);
jest.mock("rsuite/Table", () => require("./testUtils/rsuiteMocks").Table);
jest.mock("rsuite/Panel", () => require("./testUtils/rsuiteMocks").Panel);
jest.mock("rsuite/Radio", () => require("./testUtils/rsuiteMocks").Radio);

const mockConfirmOpen = jest.fn();
jest.mock("./ConfirmDialog", () => ({
    open: (...args: any[]) => mockConfirmOpen(...args)
}));
const mockReportInfo = jest.fn();
jest.mock("./reportInfo", () => (...args: any[]) => mockReportInfo(...args));

const mockRoles = jest.fn();
const mockCandidates = jest.fn();
const mockAttach = jest.fn();
const mockDetach = jest.fn();
jest.mock("api-clients/LlmServicesApis", () => {
    const actual = jest.requireActual("api-clients/LlmServicesApis");
    return {
        ...actual,
        listAccessProfileRoles: (...args: any[]) => mockRoles(...args),
        listAccessProfileRoleCandidates: (...args: any[]) =>
            mockCandidates(...args),
        attachAccessProfileRole: (...args: any[]) => mockAttach(...args),
        detachAccessProfileRole: (...args: any[]) => mockDetach(...args)
    };
});

// eslint-disable-next-line import/first
import AccessProfileRolesPanel, {
    removeRoleConfirmText
} from "./AccessProfileRolesPanel";
// eslint-disable-next-line import/first
import { addRoleConfirmText } from "./AccessProfileAddRolePopUp";
// eslint-disable-next-line import/first
import { LlmServicesApiError } from "api-clients/LlmServicesApis";

const profileId = "3b1eceed-603e-4173-91ff-a3475c75b25b";
const analysts = {
    id: "00000000-0000-4000-8000-0000000000a1",
    name: "Data Analysts",
    description: "Analysts across the agency"
};
const stewards = {
    id: "00000000-0000-4000-8000-0000000000a2",
    name: "Data Stewards",
    description: null
};

let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
    (global as any).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
    [
        mockConfirmOpen,
        mockReportInfo,
        mockRoles,
        mockCandidates,
        mockAttach,
        mockDetach
    ].forEach((mock) => mock.mockReset());
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

async function render(canEdit = true) {
    act(() => {
        root.render(
            <MemoryRouter>
                <AccessProfileRolesPanel
                    profileId={profileId}
                    profileName="Finance analysts"
                    canEdit={canEdit}
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

function type(element: HTMLInputElement, value: string) {
    Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
    )!.set!.call(element, value);
    act(() => {
        element.dispatchEvent(new Event("input", { bubbles: true }));
    });
}

const dialog = () => container.querySelector('[role="dialog"]');

describe("AccessProfileRolesPanel", () => {
    it("lists roles with their ID and description, and no users", async () => {
        mockRoles.mockResolvedValue([analysts, stewards]);
        await render();
        expect(mockRoles).toHaveBeenCalledWith(profileId, {
            offset: 0,
            limit: 20
        });
        const rows = Array.from(container.querySelectorAll("tr"));
        expect(rows.map((row) => row.textContent)).toEqual([
            `Data Analysts${analysts.id}Analysts across the agencyRemove`,
            `Data Stewards${stewards.id}Remove`
        ]);
        const text = container.textContent || "";
        expect(text).toContain(
            "To give individual people access, add them to one of these roles in Settings → Users. People may also have access through the profile's org unit or the Public setting."
        );
        expect(
            container.querySelector('a[href="/settings/users"]')
        ).not.toBeNull();
        // no user search, direct-user list or inferred access list
        expect(text).not.toMatch(/user search|email|display name/i);
        expect(container.querySelectorAll("input").length).toBe(0);
    });

    it("shows an empty grid when no role holds the permission (LIFE-5)", async () => {
        mockRoles.mockResolvedValue([]);
        await render();
        expect(container.textContent).toContain(
            "No roles give access to this profile yet."
        );
        expect(container.textContent).not.toMatch(/repair/i);
        expect(button("Add role")).toBeTruthy();
    });

    it("steps back when a later page was emptied meanwhile", async () => {
        const page1 = Array.from({ length: 20 }, (_, i) => ({
            id: `00000000-0000-4000-8000-0000000001${10 + i}`,
            name: `Role ${i}`,
            description: null
        }));
        mockRoles
            .mockResolvedValueOnce(page1)
            .mockResolvedValueOnce([])
            .mockResolvedValue(page1);
        await render();
        await click(button("Next page"));
        await flush();
        expect(mockRoles.mock.calls.map((call) => call[1].offset)).toEqual([
            0,
            20,
            0
        ]);
        expect(container.textContent).toContain("Role 19");
    });

    it("hides Add and Remove without update permission", async () => {
        mockRoles.mockResolvedValue([analysts]);
        await render(false);
        expect(() => button("Add role")).toThrow();
        expect(() => button("Remove")).toThrow();
    });

    it("shows an actionable error", async () => {
        mockRoles.mockRejectedValue(new LlmServicesApiError("down", 503));
        await render();
        expect(container.textContent).toContain(
            "LLM Services or the Authorization API is unavailable. Retry shortly."
        );
        mockRoles.mockResolvedValue([analysts]);
        await click(button("Retry"));
        expect(container.textContent).toContain("Data Analysts");
    });

    it("adds a role picked from the server's candidates", async () => {
        mockRoles.mockResolvedValueOnce([]).mockResolvedValue([analysts]);
        mockCandidates.mockResolvedValue([analysts]);
        await render();
        await click(button("Add role"));

        expect(dialog()).not.toBeNull();
        expect(dialog()!.textContent).toContain(
            'Add a role to "Finance analysts"'
        );
        // the picker shows exactly what API-4 offers (it excludes
        // Anonymous Users, Admin Users and attached roles)
        expect(mockCandidates).toHaveBeenCalledWith(profileId, {
            q: "",
            limit: 20
        });
        expect(dialog()!.textContent).toContain(analysts.description);
        expect(dialog()!.textContent).toContain(analysts.id);
        expect(
            dialog()!.querySelector(
                `input[aria-label="Select role ${analysts.name}"]`
            )
        ).not.toBeNull();
        expect(button("Add role").textContent).toBe("Add role");

        const search = container.querySelector<HTMLInputElement>(
            "#access-profile-role-search"
        )!;
        expect(
            container.querySelector('label[for="access-profile-role-search"]')
                ?.textContent
        ).toBe("Search roles by name");
        type(search, "data");
        await click(button("Search"));
        expect(mockCandidates).toHaveBeenLastCalledWith(profileId, {
            q: "data",
            limit: 20
        });

        const radio = dialog()!.querySelector<HTMLInputElement>(
            `input[value="${analysts.id}"]`
        )!;
        await click(radio);
        expect(dialog()!.textContent).toContain(
            addRoleConfirmText("Data Analysts")
        );
        expect(addRoleConfirmText("Data Analysts")).toBe(
            'Everyone with role "Data Analysts" will be able to use this profile.'
        );

        mockAttach.mockResolvedValue(undefined);
        // the dialog's own Add role button is the last one
        const addButtons = Array.from(
            container.querySelectorAll<HTMLButtonElement>("button")
        ).filter((item) => item.textContent === "Add role");
        await click(addButtons[addButtons.length - 1]);
        expect(mockAttach).toHaveBeenCalledWith(profileId, analysts.id);
        expect(dialog()).toBeNull();
        expect(container.textContent).toContain("Data Analysts");
    });

    it("keeps the pop-up open with the error when attaching fails", async () => {
        mockRoles.mockResolvedValue([]);
        mockCandidates.mockResolvedValue([stewards]);
        mockAttach.mockRejectedValue(new LlmServicesApiError("nope", 422));
        await render();
        await click(button("Add role"));
        await click(
            dialog()!.querySelector<HTMLInputElement>(
                `input[value="${stewards.id}"]`
            )!
        );
        const addButtons = Array.from(
            container.querySelectorAll<HTMLButtonElement>("button")
        ).filter((item) => item.textContent === "Add role");
        await click(addButtons[addButtons.length - 1]);
        expect(dialog()).not.toBeNull();
        expect(dialog()!.textContent).toContain(
            "The change was rejected: nope"
        );
    });

    it("removes only the profile's access from the role after confirmation", async () => {
        mockRoles.mockResolvedValueOnce([analysts]).mockResolvedValue([]);
        await render();
        await click(button("Remove role Data Analysts"));
        const confirm = mockConfirmOpen.mock.calls[0][0];
        expect(confirm.confirmMsg).toBe(
            removeRoleConfirmText("Data Analysts", "Finance analysts")
        );
        expect(confirm.confirmMsg).toContain(
            "The role and its users are not changed."
        );
        expect(mockDetach).not.toHaveBeenCalled();

        mockDetach.mockResolvedValue(undefined);
        await act(async () => {
            await confirm.confirmHandler();
        });
        await flush();
        expect(mockDetach).toHaveBeenCalledWith(profileId, analysts.id);
        expect(container.textContent).toContain(
            "No roles give access to this profile yet."
        );
    });

    it("reports a failed removal so it can be retried", async () => {
        mockRoles.mockResolvedValue([analysts]);
        mockDetach.mockRejectedValue(new LlmServicesApiError("down", 503));
        await render();
        await click(button("Remove role Data Analysts"));
        const confirm = mockConfirmOpen.mock.calls[0][0];
        await expect(confirm.confirmHandler()).rejects.toThrow(
            "Failed to remove the role's access: LLM Services or the Authorization API is unavailable. Retry shortly."
        );
    });
});
