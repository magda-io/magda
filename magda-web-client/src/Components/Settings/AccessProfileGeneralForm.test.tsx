import React from "react";
import { createRoot, Root } from "react-dom/client";
import { act } from "react-dom/test-utils";

jest.mock("react", () =>
    jest.requireActual(
        require.resolve("react", {
            paths: [require.resolve("react-dom")]
        })
    )
);

jest.mock("../../config", () => ({
    config: { baseUrl: "/", featureFlags: {} }
}));
jest.mock("./SideNavigation", () => () => null);
jest.mock("./Breadcrumb", () => () => null);
jest.mock("Components/OrgUnitNameLabel", () => ({ id }: any) => (
    <span>org:{id}</span>
));
jest.mock("rsuite/Button", () => require("./testUtils/rsuiteMocks").Button);
jest.mock("rsuite/Input", () => require("./testUtils/rsuiteMocks").Input);
jest.mock(
    "rsuite/InputGroup",
    () => require("./testUtils/rsuiteMocks").InputGroup
);
jest.mock("rsuite/Message", () => require("./testUtils/rsuiteMocks").Message);
jest.mock("rsuite/Loader", () => require("./testUtils/rsuiteMocks").Loader);
jest.mock(
    "rsuite/Pagination",
    () => require("./testUtils/rsuiteMocks").Pagination
);
jest.mock("rsuite/Table", () => require("./testUtils/rsuiteMocks").Table);
jest.mock("rsuite/Radio", () => require("./testUtils/rsuiteMocks").Radio);
jest.mock(
    "rsuite/RadioGroup",
    () => require("./testUtils/rsuiteMocks").RadioGroup
);
jest.mock(
    "rsuite/TagPicker",
    () => require("./testUtils/rsuiteMocks").TagPicker
);
jest.mock(
    "rsuite/SelectPicker",
    () => require("./testUtils/rsuiteMocks").SelectPicker
);
jest.mock("rsuite/Toggle", () => require("./testUtils/rsuiteMocks").Toggle);

const mockConfirmOpen = jest.fn();
jest.mock("./ConfirmDialog", () => ({
    open: (...args: any[]) => mockConfirmOpen(...args)
}));

const mockListOrgUnits = jest.fn();
jest.mock("api-clients/OrgUnitApis", () => ({
    listOrgUnits: (...args: any[]) => mockListOrgUnits(...args)
}));

const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockDelete = jest.fn();
const mockRoles = jest.fn();
const mockModels = jest.fn();
jest.mock("api-clients/LlmServicesApis", () => {
    const actual = jest.requireActual("api-clients/LlmServicesApis");
    return {
        ...actual,
        createAccessProfile: (...args: any[]) => mockCreate(...args),
        updateAccessProfile: (...args: any[]) => mockUpdate(...args),
        deleteAccessProfile: (...args: any[]) => mockDelete(...args),
        listAccessProfileRoles: (...args: any[]) => mockRoles(...args),
        getAvailableModels: (...args: any[]) => mockModels(...args)
    };
});

// eslint-disable-next-line import/first
import AccessProfileGeneralForm, {
    deleteConfirmMessage,
    formatLimit,
    LIMITS_HELP,
    ORG_UNIT_EXAMPLE,
    ORG_UNIT_HELP,
    PUBLIC_HELP,
    STALE_MESSAGE,
    toFormState,
    unformatLimit,
    validateForm
} from "./AccessProfileGeneralForm";
// eslint-disable-next-line import/first
import { LlmServicesApiError } from "api-clients/LlmServicesApis";
// eslint-disable-next-line import/first
import { NO_VISIBLE_ORG_UNITS } from "./AccessProfileOrgUnitPicker";

const corporate = {
    id: "00000000-0000-4000-8000-0000000000c1",
    name: "Corporate",
    left: 1,
    right: 6
};
const finance = {
    id: "00000000-0000-4000-8000-0000000000f1",
    name: "Finance",
    left: 2,
    right: 5
};
const payroll = {
    id: "00000000-0000-4000-8000-0000000000f2",
    name: "Payroll",
    left: 3,
    right: 4
};

const profile = {
    id: "3b1eceed-603e-4173-91ff-a3475c75b25b",
    name: "Finance analysts",
    description: "Finance team models",
    allowedModels: ["magda-agent-default"],
    enabled: true,
    orgUnitId: finance.id,
    constraintExemption: false,
    usePermissionId: "00000000-0000-4000-8000-0000000000aa",
    allowedDailyTokens: 100000,
    allowedWeeklyTokens: null,
    allowedMonthlyTokens: 0,
    revision: 3,
    createdBy: null,
    updatedBy: null,
    createdAt: "2026-11-25T01:00:00.000Z",
    updatedAt: "2026-11-25T02:00:00.000Z"
};

let container: HTMLDivElement;
let root: Root;
const onSaved = jest.fn();
const onDeleted = jest.fn();
const onReload = jest.fn();

beforeAll(() => {
    (global as any).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
    [
        mockConfirmOpen,
        mockCreate,
        mockUpdate,
        mockDelete,
        mockRoles,
        mockModels,
        mockListOrgUnits,
        onSaved,
        onDeleted,
        onReload
    ].forEach((mock) => mock.mockReset());
    mockModels.mockResolvedValue({
        items: ["magda-agent-default", "magda-fast"],
        servedListAvailable: true
    });
    mockListOrgUnits.mockResolvedValue([payroll, corporate, finance]);
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

async function render(props: Partial<any> = {}) {
    act(() => {
        root.render(
            <AccessProfileGeneralForm
                canEdit={true}
                canDelete={true}
                onSaved={onSaved}
                onDeleted={onDeleted}
                onReload={onReload}
                {...props}
            />
        );
    });
    await flush();
}

function field<T extends HTMLElement = HTMLInputElement>(id: string): T {
    const element = container.querySelector<T>(`#${id}`);
    if (!element) throw new Error(`No field ${id}`);
    return element;
}

/** Set a value the way a user would, so React sees the change. */
function type(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
    const prototype = Object.getPrototypeOf(element);
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(
        element,
        value
    );
    act(() => {
        element.dispatchEvent(new Event("input", { bubbles: true }));
    });
}

function choose(select: HTMLSelectElement, values: string[]) {
    Array.from(select.options).forEach((option) => {
        option.selected = values.includes(option.value);
    });
    act(() => {
        select.dispatchEvent(new Event("change", { bubbles: true }));
    });
}

function button(label: string) {
    const match = Array.from(
        container.querySelectorAll<HTMLButtonElement>("button")
    ).find((item) => item.textContent?.trim() === label);
    if (!match) throw new Error(`No button ${label}`);
    return match;
}

async function click(element: HTMLElement) {
    act(() => element.click());
    await flush();
}

function labelled(text: string) {
    const label = Array.from(container.querySelectorAll("label")).find((item) =>
        item.textContent?.includes(text)
    );
    if (!label) throw new Error(`No label ${text}`);
    return label.querySelector("input") as HTMLInputElement;
}

describe("limit formatting", () => {
    it("groups digits for reading, strips them for editing, and accepts them when saving", () => {
        expect(formatLimit("32343232")).toBe("32,343,232");
        expect(formatLimit(" 300,000,000 ")).toBe("300,000,000");
        expect(formatLimit("0")).toBe("0");
        expect(formatLimit("")).toBe("");
        expect(formatLimit("1.5")).toBe("1.5");
        expect(unformatLimit("32,343,232")).toBe("32343232");
        expect(
            toFormState({ ...profile, allowedMonthlyTokens: 300000000 } as any)
                .allowedMonthlyTokens
        ).toBe("300,000,000");
        const save = (allowedMonthlyTokens: string) =>
            validateForm({
                ...toFormState(),
                name: "Finance",
                allowedMonthlyTokens
            });
        expect(save("300,000,000").fields?.allowedMonthlyTokens).toBe(
            300000000
        );
        expect(save("  ").fields?.allowedMonthlyTokens).toBeNull();
    });

    it("never silently changes a malformed limit: it's invalid, and only blank is unlimited", () => {
        for (const typed of [
            "1,5",
            ",",
            "1,,000",
            ",100",
            "100,",
            "1,0000",
            "12,34,567",
            "1 000",
            "1_000",
            "-1"
        ]) {
            const result = validateForm({
                ...toFormState(),
                name: "Finance",
                allowedDailyTokens: typed
            });
            expect([typed, result.fields]).toEqual([typed, undefined]);
            expect(result.errors.allowedDailyTokens).toBe(
                "Enter a whole number of tokens, or leave it blank."
            );
            // left as typed, so the error is visible
            expect(formatLimit(typed)).toBe(typed);
            expect(unformatLimit(typed)).toBe(typed);
        }
    });
});

describe("validateForm", () => {
    it("maps blank limits to unlimited and keeps 0 as blocking", () => {
        const form = {
            ...toFormState(),
            name: "  Finance  ",
            allowedDailyTokens: " 1000 ",
            allowedMonthlyTokens: "0"
        };
        expect(validateForm(form)).toEqual({
            errors: {},
            fields: {
                name: "Finance",
                description: null,
                allowedModels: ["*"],
                enabled: true,
                orgUnitId: null,
                constraintExemption: false,
                allowedDailyTokens: 1000,
                allowedWeeklyTokens: null,
                allowedMonthlyTokens: 0
            }
        });
    });

    it("rejects a blank name, missing models and invalid limits", () => {
        const { fields, errors } = validateForm({
            ...toFormState(),
            modelMode: "selected",
            models: [],
            allowedDailyTokens: "1.5",
            allowedWeeklyTokens: "-1",
            allowedMonthlyTokens: "99999999999999999999"
        });
        expect(fields).toBeUndefined();
        expect(Object.keys(errors).sort()).toEqual([
            "allowedDailyTokens",
            "allowedMonthlyTokens",
            "allowedWeeklyTokens",
            "models",
            "name"
        ]);
    });

    it("round-trips a profile", () => {
        expect(validateForm(toFormState(profile as any)).fields).toEqual({
            name: profile.name,
            description: profile.description,
            allowedModels: profile.allowedModels,
            enabled: true,
            orgUnitId: finance.id,
            constraintExemption: false,
            allowedDailyTokens: 100000,
            allowedWeeklyTokens: null,
            allowedMonthlyTokens: 0
        });
    });
});

describe("deleteConfirmMessage", () => {
    it("names the profile, without counting roles", () => {
        expect(deleteConfirmMessage("X")).toBe(
            'Delete profile "X"? Users will lose the access this profile gives, and it will be removed from every role that holds it. Their usage history is kept.'
        );
    });
});

describe("AccessProfileGeneralForm", () => {
    it("shows the audience, Public and limit help text", async () => {
        await render();
        const text = container.textContent;
        expect(text).toContain(ORG_UNIT_HELP);
        expect(text).toContain(ORG_UNIT_EXAMPLE);
        expect(text).toContain(PUBLIC_HELP);
        expect(text).toContain(LIMITS_HELP);
        expect(text).toContain(
            "New models the operator adds become available under *."
        );
    });

    it("shows limits with digit groups, and plain digits while editing", async () => {
        await render({ profile });
        const daily = field("access-profile-allowedDailyTokens");
        expect(daily.value).toBe("100,000");
        act(() => {
            daily.focus();
        });
        expect(daily.value).toBe("100000");
        type(daily, "300000000");
        act(() => {
            daily.blur();
        });
        expect(daily.value).toBe("300,000,000");
    });

    it("creates a profile with * and limits", async () => {
        const created = { ...profile, allowedModels: ["*"] };
        mockCreate.mockResolvedValue(created);
        await render();
        expect(labelled("All available models (*)").checked).toBe(true);
        expect(labelled("Enabled").checked).toBe(true);
        expect(labelled("Public").checked).toBe(false);

        type(field("access-profile-name"), "Everyone");
        type(field("access-profile-allowedDailyTokens"), "50000");
        type(field("access-profile-allowedMonthlyTokens"), "0");
        act(() => labelled("Public").click());
        await click(button("Create profile"));

        expect(mockCreate).toHaveBeenCalledWith({
            name: "Everyone",
            description: null,
            allowedModels: ["*"],
            enabled: true,
            orgUnitId: null,
            constraintExemption: true,
            allowedDailyTokens: 50000,
            allowedWeeklyTokens: null,
            allowedMonthlyTokens: 0
        });
        expect(onSaved).toHaveBeenCalledWith(created, true);
    });

    it("doesn't send an invalid form", async () => {
        await render();
        type(field("access-profile-allowedWeeklyTokens"), "lots");
        await click(button("Create profile"));
        expect(mockCreate).not.toHaveBeenCalled();
        expect(container.textContent).toContain("Enter a name.");
        expect(container.textContent).toContain(
            "Enter a whole number of tokens, or leave it blank."
        );
        expect(field("access-profile-name").getAttribute("aria-invalid")).toBe(
            "true"
        );
    });

    it("offers the available models and an org unit picker with paths", async () => {
        mockCreate.mockResolvedValue(profile);
        await render();
        act(() => labelled("Only the models selected below").click());
        await flush();
        const models = field<HTMLSelectElement>("access-profile-models");
        expect(Array.from(models.options).map((o) => o.value)).toEqual([
            "magda-agent-default",
            "magda-fast"
        ]);
        choose(models, ["magda-fast"]);

        const orgUnit = field<HTMLSelectElement>("access-profile-org-unit");
        expect(Array.from(orgUnit.options).map((o) => o.text)).toEqual([
            "No org unit",
            "Corporate",
            "Corporate › Finance",
            "Corporate › Finance › Payroll"
        ]);
        choose(orgUnit, [finance.id]);

        type(field("access-profile-name"), "Fast");
        await click(button("Create profile"));
        expect(mockCreate.mock.calls[0][0]).toMatchObject({
            allowedModels: ["magda-fast"],
            orgUnitId: finance.id
        });
    });

    it("explains an empty org unit list and keeps the current unit", async () => {
        // profile managers hold no authObject/* permissions (AUTH-11)
        mockListOrgUnits.mockResolvedValue([]);
        await render({ profile });
        expect(container.textContent).toContain(NO_VISIBLE_ORG_UNITS);
        const orgUnit = field<HTMLSelectElement>("access-profile-org-unit");
        expect(Array.from(orgUnit.options).map((o) => o.text)).toEqual([
            "No org unit",
            `Org unit ${finance.id}`
        ]);
        expect(orgUnit.value).toBe(finance.id);
    });

    it("keeps an alias that's no longer available visible", async () => {
        await render({
            profile: { ...profile, allowedModels: ["retired-model"] }
        });
        const models = field<HTMLSelectElement>("access-profile-models");
        expect(Array.from(models.options).map((o) => o.text)).toContain(
            "retired-model (not currently available)"
        );
    });

    it("saves with the revision", async () => {
        const saved = { ...profile, name: "Renamed", revision: 4 };
        mockUpdate.mockResolvedValue(saved);
        await render({ profile });
        type(field("access-profile-name"), "Renamed");
        await click(button("Save changes"));
        expect(mockUpdate).toHaveBeenCalledWith(
            profile.id,
            3,
            expect.objectContaining({ name: "Renamed" })
        );
        expect(onSaved).toHaveBeenCalledWith(saved, false);
    });

    it("shows the reload message on a stale save and keeps the form contents", async () => {
        // UI acceptance case 9 / DATA-4
        mockUpdate.mockRejectedValue(
            new LlmServicesApiError(
                "changed",
                409,
                "llm_profile_stale_revision",
                4
            )
        );
        await render({ profile });
        type(field("access-profile-name"), "My unsaved name");
        type(field("access-profile-allowedWeeklyTokens"), "777");
        await click(button("Save changes"));

        expect(container.textContent).toContain(STALE_MESSAGE);
        expect(field("access-profile-name").value).toBe("My unsaved name");
        expect(field("access-profile-allowedWeeklyTokens").value).toBe("777");
        expect(onSaved).not.toHaveBeenCalled();

        await click(button("Reload"));
        expect(onReload).toHaveBeenCalled();
    });

    it("shows a validation error from the server", async () => {
        mockUpdate.mockRejectedValue(
            new LlmServicesApiError(
                "orgUnitId doesn't exist",
                422,
                "llm_profile_invalid"
            )
        );
        await render({ profile });
        await click(button("Save changes"));
        expect(container.textContent).toContain(
            "The change was rejected: orgUnitId doesn't exist"
        );
    });

    it("confirms a delete, and reports a failed delete so it can be retried", async () => {
        await render({ profile });
        await click(button("Delete profile"));

        const dialog = mockConfirmOpen.mock.calls[0][0];
        expect(dialog.confirmMsg).toBe(
            deleteConfirmMessage("Finance analysts")
        );
        // no role lookup just to word the confirmation
        expect(mockRoles).not.toHaveBeenCalled();

        mockDelete.mockRejectedValueOnce(new LlmServicesApiError("down", 503));
        await expect(dialog.confirmHandler()).rejects.toThrow(
            "Failed to delete the access profile: LLM Services or the Authorization API is unavailable. Retry shortly."
        );
        expect(onDeleted).not.toHaveBeenCalled();

        mockDelete.mockResolvedValueOnce(undefined);
        await act(async () => {
            await dialog.confirmHandler();
        });
        expect(mockDelete).toHaveBeenCalledWith(profile.id);
        expect(onDeleted).toHaveBeenCalledWith(profile);
    });

    it("is read-only without update permission", async () => {
        await render({ profile, canEdit: false, canDelete: false });
        expect(field("access-profile-name").disabled).toBe(true);
        expect(labelled("Public").disabled).toBe(true);
        expect(() => button("Save changes")).toThrow();
        expect(() => button("Delete profile")).toThrow();
        expect(container.textContent).toContain(
            "You can view this profile but not change it."
        );
    });
});
