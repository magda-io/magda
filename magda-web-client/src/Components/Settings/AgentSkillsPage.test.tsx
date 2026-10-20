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
    }: any) =>
        As ? (
            <As {...rest}>{children}</As>
        ) : (
            <button type="button" {...rest}>
                {children}
            </button>
        )
);
jest.mock("rsuite/ButtonGroup", () => ({ children, ...rest }: any) => (
    <div {...rest}>{children}</div>
));
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
jest.mock("rsuite/Panel", () => ({ children, bordered, ...rest }: any) => (
    <div {...rest}>{children}</div>
));

let mockUserState: any;
jest.mock("react-redux", () => ({
    useSelector: (selector: any) => selector(mockUserState)
}));

const mockList = jest.fn();
const mockDownload = jest.fn();
const mockReplace = jest.fn();
jest.mock("../../api-clients/AgentSkillApis", () => {
    const actual = jest.requireActual("../../api-clients/AgentSkillApis");
    return {
        ...actual,
        listAgentSkills: (...args: any[]) => mockList(...args),
        downloadAgentSkillArchive: (...args: any[]) => mockDownload(...args),
        replaceAgentSkillArchive: (...args: any[]) => mockReplace(...args)
    };
});

// eslint-disable-next-line import/first
import AgentSkillsPage from "./AgentSkillsPage";
// eslint-disable-next-line import/first
import {
    AgentSkillApiError,
    agentSkillListQuery
} from "../../api-clients/AgentSkillApis";

const me = "00000000-0000-4000-8000-00000000a11c";
const other = "00000000-0000-4000-8000-000000000b0b";

function skill(overrides: Record<string, any> = {}) {
    return {
        id: `agent-skill-${me}-csv-clean`,
        name: "csv-clean",
        description: "Normalise CSV headings",
        type: "user",
        userId: me,
        ownerId: me,
        createdAt: "2026-10-18T01:00:00.000Z",
        createdBy: me,
        updatedAt: "2026-10-19T01:00:00.000Z",
        updatedBy: me,
        checksum: "a".repeat(64),
        ...overrides
    };
}

const systemSkill = skill({
    id: "agent-skill-system-review",
    name: "system-review",
    type: "system",
    userId: undefined,
    ownerId: other,
    createdBy: other,
    updatedBy: other
});

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

let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
    (global as any).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
    mockList.mockReset();
    mockDownload.mockReset();
    mockReplace.mockReset();
    signedIn([
        "agentWorkspace/access",
        "object/agentSkill/user/read",
        "object/agentSkill/user/update",
        "object/agentSkill/system/read"
    ]);
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

async function render() {
    act(() => {
        root.render(
            <MemoryRouter>
                <AgentSkillsPage />
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

function cards() {
    return Array.from(container.querySelectorAll(".agent-skill-card"));
}

describe("agentSkillListQuery", () => {
    it("maps filters to server-side catalogue queries without orderBy", () => {
        expect(agentSkillListQuery("all").toString()).toBe("type=all&limit=10");
        expect(agentSkillListQuery("system").toString()).toBe(
            "type=system&limit=10"
        );
        expect(
            agentSkillListQuery("mine", {
                pageToken: "42",
                q: "  csv  ",
                limit: 5
            }).toString()
        ).toBe("type=user&userId=current&limit=5&pageToken=42&q=csv");
        expect(agentSkillListQuery("all").has("orderBy")).toBe(false);
    });
});

describe("AgentSkillsPage", () => {
    const guide = () =>
        container.querySelector<HTMLDetailsElement>(".agent-skills-guide");

    it("opens the guide when there is nothing to browse yet", async () => {
        mockList.mockResolvedValue({ items: [], hasMore: false });
        await render();
        expect(guide()?.open).toBe(true);
    });

    it("collapses the guide when skills exist and respects the user's choice", async () => {
        mockList
            .mockResolvedValueOnce({ items: [skill()], hasMore: false })
            .mockResolvedValue({ items: [], hasMore: false });
        await render();
        expect(guide()?.open).toBe(false);
        expect(guide()?.querySelector("summary")?.textContent).toBe(
            "What are Agent Skills? How do I create one?"
        );
        // Opening it, then reaching an empty filter, keeps the user's choice.
        act(() => {
            guide()!.open = true;
            guide()!.dispatchEvent(new Event("toggle"));
        });
        await click("My Skills");
        expect(guide()?.open).toBe(true);
        act(() => {
            guide()!.open = false;
            guide()!.dispatchEvent(new Event("toggle"));
        });
        await click("System Skills");
        expect(guide()?.open).toBe(false);
    });

    it("keeps full metadata behind each card's Details disclosure", async () => {
        mockList.mockResolvedValue({ items: [skill()], hasMore: false });
        await render();
        const details = cards()[0].querySelector<HTMLDetailsElement>(
            ".agent-skill-details"
        )!;
        expect(details.open).toBe(false);
        expect(details.querySelector("summary")?.textContent).toMatch(
            /^Updated .*2026Details$/
        );
        expect(details.querySelector("dl")?.textContent).toContain(
            "Publication ID"
        );
    });

    it("explains skills with the CSV example and links to Open Workspace", async () => {
        mockList.mockResolvedValue({ items: [], hasMore: false });
        await render();
        expect(container.textContent).toContain("Agent Skills");
        expect(container.textContent).toContain(
            "We've just cleaned up a CSV with inconsistent column names"
        );
        expect(
            container.querySelector('a[href="/settings/agent-workspace"]')
                ?.textContent
        ).toBe("Open Workspace");
    });

    it("omits the Open Workspace link for a catalogue-only user", async () => {
        signedIn(["object/agentSkill/system/read"]);
        mockList.mockResolvedValue({ items: [], hasMore: false });
        await render();
        expect(
            container.querySelector('a[href="/settings/agent-workspace"]')
        ).toBeNull();
        expect(container.textContent).toContain(
            "Creating skills needs Agent Workspace access"
        );
    });

    it("shows publication metadata, user ZIP actions and a metadata-only system entry", async () => {
        mockList.mockResolvedValue({
            items: [skill(), systemSkill],
            hasMore: false
        });
        await render();
        expect(mockList).toHaveBeenCalledWith("all", {
            q: "",
            pageToken: undefined,
            limit: 10
        });
        const [user, system] = cards();
        expect(user.textContent).toContain(`agent-skill-${me}-csv-clean`);
        expect(user.textContent).toContain("Intended user");
        expect(user.textContent).toContain("You");
        expect(user.querySelectorAll("button")).toHaveLength(2);
        expect(user.querySelector('input[type="file"]')).not.toBeNull();

        expect(system.textContent).toContain("agent-skill-system-review");
        expect(system.textContent).toContain(other);
        expect(system.textContent).not.toContain("Intended user");
        expect(system.querySelectorAll("button")).toHaveLength(0);
        expect(system.querySelector('input[type="file"]')).toBeNull();
        expect(container.textContent).not.toMatch(/Delete|Upload new|Edit/);
    });

    it("offers Download but not Replace without typed update permission", async () => {
        signedIn(["object/agentSkill/user/read"]);
        mockList.mockResolvedValue({ items: [skill()], hasMore: false });
        await render();
        const actions = Array.from(cards()[0].querySelectorAll("button")).map(
            (item) => item.textContent
        );
        expect(actions).toEqual(["Download ZIP"]);
    });

    it("pages with keyset tokens and resets paging when the filter changes", async () => {
        mockList
            .mockResolvedValueOnce({
                items: [skill()],
                hasMore: true,
                nextPageToken: "token-2"
            })
            .mockResolvedValueOnce({ items: [systemSkill], hasMore: false })
            .mockResolvedValueOnce({
                items: [skill()],
                hasMore: true,
                nextPageToken: "token-2"
            })
            .mockResolvedValueOnce({ items: [skill()], hasMore: false });
        await render();
        expect(button("Previous").disabled).toBe(true);

        await click("Next");
        expect(mockList).toHaveBeenLastCalledWith("all", {
            q: "",
            pageToken: "token-2",
            limit: 10
        });
        expect(container.textContent).toContain("Page 2");
        expect(button("Next").disabled).toBe(true);

        await click("Previous");
        expect(mockList).toHaveBeenLastCalledWith("all", {
            q: "",
            pageToken: undefined,
            limit: 10
        });

        await click("My Skills");
        expect(mockList).toHaveBeenLastCalledWith("mine", {
            q: "",
            pageToken: undefined,
            limit: 10
        });
        expect(button("My Skills").getAttribute("aria-pressed")).toBe("true");
    });

    it("searches server-side from the first page", async () => {
        mockList.mockResolvedValue({ items: [], hasMore: false });
        await render();
        const input = container.querySelector<HTMLInputElement>(
            'input[type="search"]'
        )!;
        act(() => {
            const setter = Object.getOwnPropertyDescriptor(
                HTMLInputElement.prototype,
                "value"
            )!.set!;
            setter.call(input, " csv ");
            input.dispatchEvent(new Event("input", { bubbles: true }));
        });
        act(() => {
            container
                .querySelector("form")!
                .dispatchEvent(
                    new Event("submit", { bubbles: true, cancelable: true })
                );
        });
        await flush();
        expect(mockList).toHaveBeenLastCalledWith("all", {
            q: "csv",
            pageToken: undefined,
            limit: 10
        });
        expect(container.textContent).toContain(
            "No published skills match “csv”"
        );
    });

    it("shows per-filter empty states", async () => {
        mockList.mockResolvedValue({ items: [], hasMore: false });
        await render();
        expect(container.textContent).toContain(
            "No published Agent Skills are available to you yet."
        );
        await click("My Skills");
        expect(container.textContent).toContain(
            "You haven't published any Agent Skills yet."
        );
    });

    it("shows a load error with Try Again", async () => {
        mockList
            .mockRejectedValueOnce(
                new AgentSkillApiError("Registry API is unavailable", 503)
            )
            .mockResolvedValueOnce({ items: [skill()], hasMore: false });
        await render();
        expect(
            container.querySelector('[role="alert"]')?.textContent
        ).toContain("Registry API is unavailable");
        await click("Try Again");
        expect(cards()).toHaveLength(1);
    });

    it("replaces an existing user ZIP and explains how to resynchronise", async () => {
        mockList.mockResolvedValue({ items: [skill()], hasMore: false });
        mockReplace.mockResolvedValue(
            skill({
                description: "Updated description",
                updatedAt: "2026-10-20T01:00:00.000Z",
                checksum: "b".repeat(64)
            })
        );
        await render();
        const input = cards()[0].querySelector<HTMLInputElement>(
            'input[type="file"]'
        )!;
        const file = new File(["zip"], "csv-clean.zip", {
            type: "application/zip"
        });
        Object.defineProperty(input, "files", { value: [file] });
        act(() => {
            input.dispatchEvent(new Event("change", { bubbles: true }));
        });
        await flush();

        expect(mockReplace).toHaveBeenCalledWith(
            expect.objectContaining({
                id: skill().id,
                checksum: "a".repeat(64)
            }),
            file
        );
        const status = cards()[0].querySelector('[role="status"]');
        expect(status?.textContent).toContain(
            "Your published skill has been updated"
        );
        expect(status?.textContent).toContain("mgd agent-skill sync");
        expect(cards()[0].textContent).toContain("Updated description");
    });

    it("reports replacement failures clearly", async () => {
        const cases: Array<[AgentSkillApiError, string]> = [
            [
                new AgentSkillApiError(
                    "SKILL.md is missing",
                    400,
                    "INVALID_SKILL_ARCHIVE"
                ),
                "not a valid Agent Skill: SKILL.md is missing"
            ],
            [
                new AgentSkillApiError(
                    "name",
                    409,
                    "AGENT_SKILL_NAME_IMMUTABLE"
                ),
                "must match this published skill"
            ],
            [
                new AgentSkillApiError(
                    "forbidden",
                    403,
                    "AGENT_SKILL_FORBIDDEN"
                ),
                "don't have permission to update"
            ],
            [
                new AgentSkillApiError(
                    "changed",
                    412,
                    "AGENT_SKILL_PRECONDITION_FAILED"
                ),
                "changed elsewhere"
            ],
            [
                new AgentSkillApiError(
                    "Could not reach Magda. Check your connection and try again.",
                    0,
                    "NETWORK_ERROR"
                ),
                "Could not reach Magda"
            ]
        ];
        for (const [error, expected] of cases) {
            mockList.mockResolvedValue({ items: [skill()], hasMore: false });
            mockReplace.mockRejectedValueOnce(error);
            await render();
            const input = cards()[0].querySelector<HTMLInputElement>(
                'input[type="file"]'
            )!;
            Object.defineProperty(input, "files", {
                configurable: true,
                value: [new File(["zip"], "bad.zip")]
            });
            act(() => {
                input.dispatchEvent(new Event("change", { bubbles: true }));
            });
            await flush();
            expect(
                cards()[0].querySelector('[role="alert"]')?.textContent
            ).toContain(expected);
        }
    });

    it("downloads a user ZIP through the authenticated API", async () => {
        mockList.mockResolvedValue({ items: [skill()], hasMore: false });
        mockDownload.mockResolvedValue({
            blob: new Blob(["zip"]),
            filename: "csv-clean.zip"
        });
        (URL as any).createObjectURL = jest.fn(() => "blob:zip");
        (URL as any).revokeObjectURL = jest.fn();
        const clicks = jest
            .spyOn(HTMLAnchorElement.prototype, "click")
            .mockImplementation(() => undefined);
        await render();
        await click("Download ZIP for csv-clean");
        expect(mockDownload).toHaveBeenCalledWith(
            expect.objectContaining({ id: skill().id })
        );
        expect(clicks).toHaveBeenCalledTimes(1);
        clicks.mockRestore();
    });
});
