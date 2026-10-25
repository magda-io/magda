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
jest.mock("Components/ValidateUser", () => () => null);
jest.mock("./Breadcrumb", () => () => null);
jest.mock("./SideNavigation", () => () => null);
jest.mock("../Dataset/Add/OrgUnitDropDown", () => ({ onChange }: any) => (
    <button type="button" onClick={() => onChange(undefined)}>
        Clear organisation
    </button>
));
jest.mock(
    "rsuite/Button",
    () => ({
        as: As,
        children,
        loading,
        appearance,
        color,
        size,
        ...rest
    }: any) => (
        <button type="button" {...rest}>
            {children}
        </button>
    )
);
jest.mock("rsuite/Input", () => ({ onChange, ...rest }: any) => (
    <input {...rest} onChange={(event) => onChange(event.target.value)} />
));
jest.mock("rsuite/Loader", () => ({ content }: any) => <span>{content}</span>);
jest.mock("rsuite/Message", () => ({ children, header }: any) => (
    <div role="alert">
        {header}
        {children}
    </div>
));
jest.mock("rsuite/Modal", () => {
    const Modal = ({ open, children, role, ...rest }: any) =>
        open ? (
            <div
                role={role || "dialog"}
                aria-labelledby={rest["aria-labelledby"]}
            >
                {children}
            </div>
        ) : null;
    Modal.Header = ({ children }: any) => <div>{children}</div>;
    Modal.Title = ({ children, id }: any) => <h4 id={id}>{children}</h4>;
    Modal.Body = ({ children }: any) => <div>{children}</div>;
    Modal.Footer = ({ children }: any) => <div>{children}</div>;
    return Modal;
});

let mockUserState: any;
jest.mock("react-redux", () => ({
    useSelector: (selector: any) => selector(mockUserState)
}));

const mockList = jest.fn();
const mockInstallations = jest.fn();
const mockAllInstallations = jest.fn();
const mockInstall = jest.fn();
const mockUninstall = jest.fn();
const mockAccess = jest.fn();
const mockUpdateAccess = jest.fn();
const mockRecipients = jest.fn();
const mockAddRecipient = jest.fn();
const mockRemoveRecipient = jest.fn();
jest.mock("../../api-clients/AgentSkillApis", () => {
    const actual = jest.requireActual("../../api-clients/AgentSkillApis");
    return {
        ...actual,
        listAgentSkills: (...args: any[]) => mockList(...args),
        listAgentSkillInstallations: (...args: any[]) =>
            mockInstallations(...args),
        listAllAgentSkillInstallations: (...args: any[]) =>
            mockAllInstallations(...args),
        installSharedAgentSkill: (...args: any[]) => mockInstall(...args),
        uninstallAgentSkill: (...args: any[]) => mockUninstall(...args),
        getAgentSkillAccess: (...args: any[]) => mockAccess(...args),
        updateAgentSkillAccess: (...args: any[]) => mockUpdateAccess(...args),
        listAgentSkillRecipients: (...args: any[]) => mockRecipients(...args),
        addAgentSkillRecipient: (...args: any[]) => mockAddRecipient(...args),
        removeAgentSkillRecipient: (...args: any[]) =>
            mockRemoveRecipient(...args)
    };
});

// eslint-disable-next-line import/first
import SharedSkillsPage from "./SharedSkillsPage";
// eslint-disable-next-line import/first
import AgentSkillAccessDialog from "./AgentSkillAccessDialog";
// eslint-disable-next-line import/first
import {
    AgentSkillApiError,
    agentSkillListQuery,
    installedNameError
} from "../../api-clients/AgentSkillApis";

const me = "00000000-0000-4000-8000-000000000b0b";
const alice = "00000000-0000-4000-8000-00000000a11c";

function shared(overrides: Record<string, any> = {}) {
    return {
        id: `agent-skill-${alice}-csv-reporter`,
        name: "csv-reporter",
        description: "Report on CSV files",
        type: "user",
        userId: alice,
        ownerId: alice,
        createdAt: "2026-10-18T01:00:00.000Z",
        createdBy: alice,
        updatedAt: "2026-10-19T01:00:00.000Z",
        updatedBy: alice,
        checksum: "a".repeat(64),
        ...overrides
    };
}

function installation(overrides: Record<string, any> = {}) {
    return {
        id: `agent-skill-${me}-team-csv`,
        effectiveName: "team-csv",
        alias: "team-csv",
        userId: me,
        sourceSkillId: shared().id,
        createdAt: "2026-10-20T01:00:00.000Z",
        source: { status: "available", skill: shared() },
        ...overrides
    };
}

function signedIn(operations: string[]) {
    mockUserState = {
        userManagement: {
            user: {
                id: me,
                roles: [],
                permissions: operations.map((uri) => ({
                    id: uri,
                    operations: [{ id: uri, uri }]
                }))
            }
        }
    };
}

const INSTALLER = [
    "object/agentSkill/user/read",
    "object/agentSkill/install/create",
    "object/agentSkill/install/read",
    "object/agentSkill/install/delete"
];

let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
    (global as any).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
    for (const mock of [
        mockList,
        mockInstallations,
        mockAllInstallations,
        mockInstall,
        mockUninstall,
        mockAccess,
        mockUpdateAccess,
        mockRecipients,
        mockAddRecipient,
        mockRemoveRecipient
    ])
        mock.mockReset();
    mockAllInstallations.mockResolvedValue([]);
    signedIn(INSTALLER);
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

async function render(element: React.ReactElement = <SharedSkillsPage />) {
    act(() => {
        root.render(<MemoryRouter>{element}</MemoryRouter>);
    });
    await flush();
}

function button(label: string) {
    const match = Array.from(
        container.querySelectorAll<HTMLButtonElement>("button")
    ).find(
        (item) =>
            item.textContent === label ||
            item.getAttribute("aria-label") === label
    );
    if (!match) throw new Error(`No button ${label}`);
    return match;
}

async function click(label: string) {
    act(() => button(label).click());
    await flush();
}

function type(input: HTMLInputElement, value: string) {
    act(() => {
        const setter = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value"
        )!.set!;
        setter.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
    });
}

async function submit(form: HTMLFormElement) {
    act(() => {
        form.dispatchEvent(
            new Event("submit", { bubbles: true, cancelable: true })
        );
    });
    await flush();
}

describe("shared catalogue helpers", () => {
    it("queries other users' publications for All available", () => {
        expect(agentSkillListQuery("shared").toString()).toBe(
            "type=user&userId=%21current&limit=10"
        );
    });

    it("validates installed names like the server", () => {
        expect(installedNameError("team-csv")).toBeUndefined();
        expect(installedNameError("system-csv")).toMatch(/reserved/);
        expect(installedNameError("magda-mgd")).toMatch(/reserved/);
        expect(installedNameError("Team")).toMatch(/lowercase/);
        expect(installedNameError("a".repeat(47))).toMatch(/46/);
    });
});

describe("SharedSkillsPage", () => {
    it("lists shared skills by default with publisher and install status", async () => {
        mockList.mockResolvedValue({
            items: [
                shared(),
                shared({ id: `agent-skill-${alice}-other`, name: "other" })
            ],
            hasMore: false
        });
        mockAllInstallations.mockResolvedValue([installation()]);
        await render();
        expect(mockList).toHaveBeenCalledWith("shared", {
            q: "",
            pageToken: undefined,
            limit: 10
        });
        expect(button("All available").getAttribute("aria-selected")).toBe(
            "true"
        );
        expect(container.textContent).toContain("Sharing permits access.");
        expect(container.textContent).toContain("Installing is explicit.");
        const cards = container.querySelectorAll(".agent-skill-card");
        expect(cards[0].textContent).toContain(`Shared by ${alice}`);
        expect(cards[0].textContent).toContain("Installed as team-csv");
        expect(cards[0].querySelector("button")).toBeNull();
        expect(cards[1].textContent).toContain("Install");
    });

    it("installs explicitly and explains when copies update", async () => {
        mockList.mockResolvedValue({ items: [shared()], hasMore: false });
        mockInstall.mockResolvedValue(
            installation({ effectiveName: "csv-reporter", alias: undefined })
        );
        await render();
        await click("Install csv-reporter");
        expect(mockInstall).toHaveBeenCalledWith(shared().id, undefined);
        expect(container.textContent).toContain("Installed as “csv-reporter”");
        expect(container.textContent).toContain("next skill sync");
        expect(container.textContent).toContain("Installed as csv-reporter");
    });

    it("asks for an alias on a name conflict instead of shadowing a skill", async () => {
        mockList.mockResolvedValue({ items: [shared()], hasMore: false });
        mockInstall
            .mockRejectedValueOnce(
                new AgentSkillApiError(
                    "Name in use",
                    409,
                    "AGENT_SKILL_NAME_CONFLICT",
                    {
                        conflict: "publication",
                        suggestedAlias: "csv-reporter-2"
                    }
                )
            )
            .mockResolvedValueOnce(
                installation({
                    id: `agent-skill-${me}-csv-reporter-2`,
                    effectiveName: "csv-reporter-2",
                    alias: "csv-reporter-2"
                })
            );
        await render();
        await click("Install csv-reporter");
        const dialog = container.querySelector('[role="dialog"]')!;
        expect(dialog.textContent).toContain(
            "already used by one of your skills"
        );
        const input = dialog.querySelector<HTMLInputElement>(
            "#install-alias-input"
        )!;
        expect(input.value).toBe("csv-reporter-2");
        type(input, "system-csv");
        expect(dialog.textContent).toContain("reserved for system skills");
        type(input, "csv-reporter-2");
        await submit(dialog.querySelector("form")!);
        expect(mockInstall).toHaveBeenLastCalledWith(
            shared().id,
            "csv-reporter-2"
        );
        expect(container.querySelector('[role="dialog"]')).toBeNull();
    });

    it("hides Install without the install permission", async () => {
        signedIn(["object/agentSkill/user/read"]);
        mockList.mockResolvedValue({ items: [shared()], hasMore: false });
        await render();
        expect(container.querySelector(".agent-skill-card button")).toBeNull();
    });

    it("shows only Installed for users who cannot read shared skills", async () => {
        signedIn([
            "object/agentSkill/install/read",
            "object/agentSkill/install/delete"
        ]);
        mockInstallations.mockResolvedValue({
            items: [installation()],
            hasMore: false
        });
        await render();
        expect(mockList).not.toHaveBeenCalled();
        expect(() => button("All available")).toThrow();
        expect(button("Installed").getAttribute("aria-selected")).toBe("true");
    });

    it("explains unavailable sources and uninstalls only after confirmation", async () => {
        mockList.mockResolvedValue({ items: [], hasMore: false });
        mockInstallations.mockResolvedValue({
            items: [
                installation({ source: { status: "unavailable" } }),
                { id: `agent-skill-${me}-broken`, problem: "INVALID_RECORD" }
            ],
            hasMore: false
        });
        mockUninstall.mockResolvedValue(undefined);
        await render();
        await click("Installed");
        expect(container.textContent).toContain("no longer available to you");
        // No publisher metadata once the source is unavailable; only the
        // recipient's own record (its source ID) is shown.
        expect(container.textContent).not.toContain("Shared by");
        expect(container.textContent).not.toContain("Report on CSV files");
        expect(container.textContent).toContain(
            "This installation record is invalid"
        );
        await click("Uninstall team-csv");
        const dialog = container.querySelector('[role="alertdialog"]')!;
        expect(dialog.textContent).toContain(
            "publisher's skill is not changed"
        );
        await click("Cancel");
        expect(mockUninstall).not.toHaveBeenCalled();
        await click("Uninstall team-csv");
        const confirm = Array.from(
            container
                .querySelector('[role="alertdialog"]')!
                .querySelectorAll("button")
        ).find((item) => item.textContent === "Uninstall")!;
        act(() => confirm.click());
        await flush();
        expect(mockUninstall).toHaveBeenCalledWith(
            `agent-skill-${me}-team-csv`
        );
        expect(container.textContent).toContain(
            "Copies are removed at your next skill sync"
        );
    });

    it("reports load errors with a retry", async () => {
        mockList.mockRejectedValue(
            new AgentSkillApiError("nope", 503, "REGISTRY_ERROR")
        );
        await render();
        expect(container.textContent).toContain("Shared Skills error");
        mockList.mockResolvedValue({ items: [], hasMore: false });
        await click("Try Again");
        expect(container.textContent).toContain("No skills have been shared");
    });
});

describe("AgentSkillAccessDialog", () => {
    const ownSkill = shared({
        id: `agent-skill-${me}-mine`,
        name: "mine",
        userId: me,
        ownerId: me
    });

    it("shares a user skill by user ID and removes after confirmation", async () => {
        mockAccess.mockResolvedValue({
            id: ownSkill.id,
            type: "user",
            recipients: { count: 1 }
        });
        mockRecipients.mockResolvedValue({
            items: [{ id: alice, displayName: "Alice" }],
            total: 1
        });
        mockAddRecipient.mockResolvedValue({ added: true });
        mockRemoveRecipient.mockResolvedValue({ removed: true });
        await render(
            <AgentSkillAccessDialog
                skill={ownSkill as any}
                onClose={jest.fn()}
            />
        );
        expect(container.textContent).toContain(
            "stays private unless you share it"
        );
        expect(container.textContent).toContain("never installed for them");
        const input = container.querySelector<HTMLInputElement>(
            `#recipients-${ownSkill.id}-user`
        )!;
        type(input, "not-a-uuid");
        await submit(input.closest("form")!);
        expect(mockAddRecipient).not.toHaveBeenCalled();
        expect(container.textContent).toContain("Account page");
        type(input, "00000000-0000-4000-8000-0000000000c3");
        await submit(input.closest("form")!);
        expect(mockAddRecipient).toHaveBeenCalledWith(
            ownSkill,
            "00000000-0000-4000-8000-0000000000c3"
        );
        await click("Remove Alice");
        expect(
            container.querySelector('[role="alertdialog"]')!.textContent
        ).toContain("next successful skill sync");
        await click("Remove access");
        expect(mockRemoveRecipient).toHaveBeenCalledWith(ownSkill, alice);
    });

    it("keeps system skills public by default and saves additive settings", async () => {
        const system = shared({
            id: "agent-skill-system-report",
            name: "system-report",
            type: "system",
            userId: undefined
        });
        mockAccess.mockResolvedValue({
            id: system.id,
            type: "system",
            public: true,
            orgUnitId: "00000000-0000-4000-8000-0000000000f1",
            recipients: { count: 0 }
        });
        mockRecipients.mockResolvedValue({ items: [], total: 0 });
        mockUpdateAccess.mockResolvedValue({
            id: system.id,
            type: "system",
            public: false,
            recipients: { count: 0 }
        });
        await render(
            <AgentSkillAccessDialog skill={system as any} onClose={jest.fn()} />
        );
        const checkbox = container.querySelector<HTMLInputElement>(
            `#public-${system.id}`
        )!;
        expect(checkbox.checked).toBe(true);
        expect(container.textContent).toContain(
            "It is not available anonymously."
        );
        expect(container.textContent).toContain(
            "do not restrict who can use this skill"
        );
        expect(button("Save access settings").disabled).toBe(true);
        act(() => checkbox.click());
        await click("Save access settings");
        expect(mockUpdateAccess).toHaveBeenCalledWith(system, {
            public: false,
            orgUnitId: "00000000-0000-4000-8000-0000000000f1"
        });
        expect(container.textContent).toContain("Access settings saved");
    });
});
