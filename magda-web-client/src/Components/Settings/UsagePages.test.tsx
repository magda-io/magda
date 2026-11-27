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

jest.mock("../../config", () => ({
    config: { baseUrl: "/", featureFlags: { llmServices: true } }
}));
jest.mock("./SideNavigation", () => () => null);
jest.mock("./Breadcrumb", () => ({ items }: any) => (
    <div data-testid="breadcrumb">
        {items.map((item: any) => item.title).join(" / ")}
    </div>
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
jest.mock(
    "rsuite/SelectPicker",
    () => require("./testUtils/rsuiteMocks").SelectPicker
);

const mockGetMyUsage = jest.fn();
const mockGetMyDailyUsage = jest.fn();
const mockListUserUsage = jest.fn();
const mockGetUserUsage = jest.fn();
const mockGetUserDailyUsage = jest.fn();
const mockListInvocableModels = jest.fn();
const mockGetNoAccessHelp = jest.fn();
jest.mock("api-clients/LlmServicesApis", () => {
    const actual = jest.requireActual("api-clients/LlmServicesApis");
    return {
        ...actual,
        getMyUsage: (...args: any[]) => mockGetMyUsage(...args),
        getMyDailyUsage: (...args: any[]) => mockGetMyDailyUsage(...args),
        listUserUsage: (...args: any[]) => mockListUserUsage(...args),
        getUserUsage: (...args: any[]) => mockGetUserUsage(...args),
        getUserDailyUsage: (...args: any[]) => mockGetUserDailyUsage(...args),
        listInvocableModels: (...args: any[]) =>
            mockListInvocableModels(...args),
        getNoAccessHelp: (...args: any[]) => mockGetNoAccessHelp(...args)
    };
});

// eslint-disable-next-line import/first
import MyUsagePage, { MY_USAGE_PATH } from "./MyUsagePage";
// eslint-disable-next-line import/first
import {
    UserUsageDetailPage,
    UserUsageListPage,
    USER_USAGE_PATH
} from "./UserUsagePage";
// eslint-disable-next-line import/first
import NoModelAccessNotice from "./NoModelAccessNotice";
// eslint-disable-next-line import/first
import { LlmServicesApiError } from "api-clients/LlmServicesApis";
// eslint-disable-next-line import/first
import { config } from "../../config";

const USER_ID = "00000000-0000-4000-8000-000000000123";
const OTHER_ID = "00000000-0000-4000-8000-000000000456";

function amounts(tokens: number, estimated = 0) {
    return {
        tokens,
        measuredInputTokens: tokens - estimated,
        measuredOutputTokens: 0,
        estimatedTokens: estimated,
        estimatedRequests: estimated ? 1 : 0
    };
}

function periodAmounts(day: number, all = day, estimated = 0) {
    return {
        allTime: amounts(all, estimated),
        day: amounts(day, estimated),
        week: amounts(day, estimated),
        month: amounts(day, estimated)
    };
}

function report(overrides: Record<string, any> = {}) {
    return {
        user: { id: USER_ID },
        timeZone: "Australia/Sydney",
        asOf: "2026-11-27T01:00:00.000Z",
        periods: {
            day: "2026-11-27",
            weekStart: "2026-11-23",
            weekEnd: "2026-11-30",
            monthStart: "2026-11-01",
            monthEnd: "2026-12-01"
        },
        access: "profiles",
        totals: periodAmounts(1260, 5260, 60),
        models: [
            {
                modelAlias: "shared-model",
                eligible: true,
                remaining: { status: "limited", remainingTokens: 240 },
                periodRemaining: {
                    day: { status: "unlimited" },
                    week: { status: "limited", remainingTokens: 240 },
                    month: { status: "unlimited" }
                },
                usage: periodAmounts(60, 1060, 60)
            },
            {
                modelAlias: "big-model",
                eligible: true,
                remaining: { status: "exhausted", remainingTokens: 0 },
                periodRemaining: {
                    day: { status: "exhausted", remainingTokens: 0 },
                    week: { status: "unlimited" },
                    month: { status: "unlimited" }
                },
                usage: periodAmounts(1200, 4200)
            },
            {
                modelAlias: "free-model",
                eligible: true,
                remaining: { status: "unlimited" },
                periodRemaining: {
                    day: { status: "unlimited" },
                    week: { status: "unlimited" },
                    month: { status: "unlimited" }
                },
                usage: periodAmounts(0)
            }
        ],
        noAccessHelp: null,
        ...overrides
    };
}

const NO_ACCESS = {
    access: "none",
    totals: periodAmounts(0),
    models: [],
    noAccessHelp: {
        text: "Request access from the service desk.",
        url: "https://help.example.test/llm"
    }
};

let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
    (global as any).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
    [
        mockGetMyUsage,
        mockGetMyDailyUsage,
        mockListUserUsage,
        mockGetUserUsage,
        mockGetUserDailyUsage,
        mockListInvocableModels,
        mockGetNoAccessHelp
    ].forEach((mock) => mock.mockReset());
    mockGetMyDailyUsage.mockResolvedValue({
        timeZone: "Australia/Sydney",
        items: [],
        total: 0
    });
    mockGetUserDailyUsage.mockResolvedValue({
        timeZone: "Australia/Sydney",
        items: [],
        total: 0
    });
    (config as any).featureFlags = { llmServices: true };
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(() => {
    act(() => root.unmount());
    container.remove();
});

async function flush() {
    for (let i = 0; i < 3; i++) {
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 0));
        });
    }
}

async function render(path: string) {
    act(() => root.unmount());
    root = createRoot(container);
    act(() => {
        root.render(
            <MemoryRouter initialEntries={[path]}>
                <Route exact path={MY_USAGE_PATH} component={MyUsagePage} />
                <Route
                    exact
                    path={USER_USAGE_PATH}
                    component={UserUsageListPage}
                />
                <Route
                    exact
                    path={`${USER_USAGE_PATH}/:userId`}
                    component={UserUsageDetailPage}
                />
                <Route
                    exact
                    path="/workspace"
                    component={NoModelAccessNotice}
                />
            </MemoryRouter>
        );
    });
    await flush();
}

function text() {
    return container.textContent || "";
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

function change(element: HTMLInputElement | HTMLSelectElement, value: string) {
    const prototype =
        element instanceof HTMLSelectElement
            ? HTMLSelectElement.prototype
            : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")!.set!;
    act(() => {
        setter.call(element, value);
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
    });
}

function modelRow(alias: string) {
    const row = Array.from(
        container.querySelectorAll("table.llm-usage-models tbody tr")
    ).find((tr) => tr.textContent?.includes(alias));
    if (!row) throw new Error(`No row for ${alias}`);
    return row.textContent || "";
}

describe("My Usage page", () => {
    it("shows totals, remaining per model as a number, Unlimited or Exhausted, and the time zone (UI case 7)", async () => {
        mockGetMyUsage.mockResolvedValue(report());
        await render(MY_USAGE_PATH);
        expect(mockGetMyUsage).toHaveBeenCalledWith();
        expect(text()).toContain("Times are in Australia/Sydney");
        expect(text()).toContain("Total (all time)5,260 tokens");
        expect(text()).toContain("Today1,260 tokens");
        // measured and estimated shown separately
        expect(text()).toContain("Measured1,200Estimated60");
        expect(modelRow("shared-model")).toContain("240 tokens");
        expect(modelRow("shared-model")).toContain("Left: Unlimited");
        expect(modelRow("big-model")).toContain("Exhausted");
        expect(modelRow("free-model")).toContain("Unlimited");
        expect(text()).toContain(
            "Remaining is an estimate of when new requests will be refused. Requests already running can go over it."
        );
        expect(text()).not.toContain("No eligible model profile");
    });

    it("shows No eligible model profile, not 0, with the configured help (UI case 6)", async () => {
        mockGetMyUsage.mockResolvedValue(report(NO_ACCESS));
        await render(MY_USAGE_PATH);
        expect(text()).toContain(
            "No eligible model profile. Ask your administrator for access."
        );
        expect(text()).toContain("Request access from the service desk.");
        const link = container.querySelector<HTMLAnchorElement>(
            ".llm-no-access-help a"
        )!;
        expect(link.href).toBe("https://help.example.test/llm");
        expect(link.rel).toBe("noopener noreferrer");
        expect(container.querySelector("table.llm-usage-models")).toBeNull();
    });

    it("handles missing or unsafe help configuration", async () => {
        mockGetMyUsage.mockResolvedValue(
            report({ ...NO_ACCESS, noAccessHelp: null })
        );
        await render(MY_USAGE_PATH);
        expect(text()).toContain("No eligible model profile.");
        expect(container.querySelector(".llm-no-access-help")).toBeNull();

        mockGetMyUsage.mockResolvedValue(
            report({
                ...NO_ACCESS,
                noAccessHelp: { url: "javascript:alert(1)" }
            })
        );
        await render(MY_USAGE_PATH);
        expect(container.querySelector(".llm-no-access-help")).toBeNull();
    });

    it("explains a ledger outage and retries", async () => {
        mockGetMyUsage.mockRejectedValueOnce(
            new LlmServicesApiError("x", 503, "llm_usage_unavailable")
        );
        await render(MY_USAGE_PATH);
        expect(text()).toContain(
            "LLM usage accounting is temporarily unavailable. Retry shortly."
        );
        mockGetMyUsage.mockResolvedValue(report());
        act(() => button("Retry").click());
        await flush();
        expect(text()).toContain("Totals");
    });

    it("pages and filters the daily history by model and date range", async () => {
        mockGetMyUsage.mockResolvedValue(report());
        mockGetMyDailyUsage.mockResolvedValue({
            timeZone: "Australia/Sydney",
            items: [
                {
                    localDate: "2026-11-27",
                    modelAlias: "shared-model",
                    tokens: 60,
                    measuredInputTokens: 0,
                    measuredOutputTokens: 0,
                    estimatedTokens: 60,
                    estimatedRequests: 1
                }
            ],
            total: 25
        });
        await render(MY_USAGE_PATH);
        expect(mockGetMyDailyUsage).toHaveBeenLastCalledWith({
            model: "",
            from: "",
            to: "",
            offset: 0,
            limit: 10
        });
        expect(text()).toContain("2026-11-27shared-model00");
        change(
            container.querySelector<HTMLSelectElement>(
                "#llm-usage-daily-model"
            )!,
            "big-model"
        );
        await flush();
        change(
            container.querySelector<HTMLInputElement>("#llm-usage-daily-from")!,
            "2026-11-01"
        );
        await flush();
        expect(mockGetMyDailyUsage).toHaveBeenLastCalledWith({
            model: "big-model",
            from: "2026-11-01",
            to: "",
            offset: 0,
            limit: 10
        });
        act(() => button("Next page").click());
        await flush();
        expect(mockGetMyDailyUsage).toHaveBeenLastCalledWith(
            expect.objectContaining({ offset: 10 })
        );

        const calls = mockGetMyDailyUsage.mock.calls.length;
        change(
            container.querySelector<HTMLInputElement>("#llm-usage-daily-to")!,
            "2026-10-01"
        );
        await flush();
        expect(text()).toContain(
            "The From date must not be after the To date."
        );
        expect(mockGetMyDailyUsage.mock.calls.length).toBe(calls);
    });
});

describe("User Usage pages", () => {
    it("lists users with names only where the viewer may read them, and searches (UI case 8)", async () => {
        mockListUserUsage.mockResolvedValue({
            items: [
                {
                    userId: OTHER_ID,
                    lastUsageDate: "2026-11-27",
                    ...amounts(55),
                    user: {
                        id: OTHER_ID,
                        displayName: "Otto Other",
                        email: "otto@example.test"
                    }
                },
                {
                    userId: USER_ID,
                    lastUsageDate: null,
                    ...amounts(0),
                    user: { id: USER_ID }
                }
            ],
            total: 2
        });
        await render(USER_USAGE_PATH);
        expect(text()).toContain("Otto Other otto@example.test");
        expect(text()).toContain(USER_ID);
        const links = Array.from(container.querySelectorAll("a")).map((a) =>
            a.getAttribute("href")
        );
        expect(links).toContain(`${USER_USAGE_PATH}/${OTHER_ID}`);
        expect(text()).toContain("None");

        change(
            container.querySelector<HTMLInputElement>(
                "#llm-user-usage-search"
            )!,
            "otto"
        );
        act(() => button("Search").click());
        await flush();
        expect(mockListUserUsage).toHaveBeenLastCalledWith(
            expect.objectContaining({ q: "otto", offset: 0 })
        );
    });

    it("explains an empty search", async () => {
        mockListUserUsage.mockResolvedValue({ items: [], total: 0 });
        await render(USER_USAGE_PATH);
        expect(text()).toContain("No usage recorded yet.");
    });

    it("shows a user's sections with the several-profiles note", async () => {
        mockGetUserUsage.mockResolvedValue(
            report({
                user: { id: OTHER_ID, displayName: "Otto Other" }
            })
        );
        await render(`${USER_USAGE_PATH}/${OTHER_ID}`);
        expect(mockGetUserUsage).toHaveBeenCalledWith(OTHER_ID);
        expect(mockGetUserDailyUsage).toHaveBeenCalledWith(
            OTHER_ID,
            expect.objectContaining({ offset: 0 })
        );
        expect(text()).toContain("Otto Other");
        expect(text()).toContain("This usage may come from several profiles.");
        expect(modelRow("shared-model")).toContain("240 tokens");
    });

    it("shows the target's no-access state without the personal help", async () => {
        mockGetUserUsage.mockResolvedValue(
            report({ ...NO_ACCESS, user: { id: OTHER_ID } })
        );
        await render(`${USER_USAGE_PATH}/${OTHER_ID}`);
        expect(text()).toContain(
            "No eligible model profile. This user can't use any model now."
        );
        expect(container.querySelector(".llm-no-access-help")).toBeNull();
    });

    it("explains a denial on a deep link", async () => {
        mockGetUserUsage.mockRejectedValue(
            new LlmServicesApiError("denied", 403, "llm_access_denied")
        );
        await render(`${USER_USAGE_PATH}/${OTHER_ID}`);
        expect(text()).toContain(
            "You don't have permission to see other users' LLM usage."
        );
    });
});

describe("Agent Workspace no model access (UI case 10)", () => {
    it("shows the message with the configured help when no alias is returned", async () => {
        mockListInvocableModels.mockResolvedValue([]);
        mockGetNoAccessHelp.mockResolvedValue({
            text: "Request access from the service desk.",
            url: "https://help.example.test/llm"
        });
        await render("/workspace");
        expect(text()).toContain(
            "No AI model access. Your account can open the Agent Workspace but has no LLM access yet. Contact your administrator."
        );
        expect(text()).toContain("Request access from the service desk.");
        expect(
            container.querySelector<HTMLAnchorElement>(".llm-no-access-help a")!
                .href
        ).toBe("https://help.example.test/llm");
    });

    it("shows the message alone when the help is missing or can't be read", async () => {
        mockListInvocableModels.mockResolvedValue([]);
        mockGetNoAccessHelp.mockRejectedValue(new Error("offline"));
        await render("/workspace");
        expect(text()).toContain("No AI model access.");
        expect(container.querySelector(".llm-no-access-help")).toBeNull();
    });

    it("shows nothing when the user has a model, or the check fails", async () => {
        mockListInvocableModels.mockResolvedValue(["magda-agent-default"]);
        await render("/workspace");
        expect(text()).toBe("");
        mockListInvocableModels.mockRejectedValue(new Error("503"));
        await render("/workspace");
        expect(text()).toBe("");
        expect(mockGetNoAccessHelp).not.toHaveBeenCalled();
    });

    it("doesn't check without LLM Services", async () => {
        (config as any).featureFlags = { llmServices: false };
        await render("/workspace");
        expect(mockListInvocableModels).not.toHaveBeenCalled();
    });
});
