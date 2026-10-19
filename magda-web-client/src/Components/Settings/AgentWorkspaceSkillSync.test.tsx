import React from "react";
import { createRoot, Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { renderToStaticMarkup } from "react-dom/server";

jest.mock("react", () =>
    jest.requireActual(
        require.resolve("react", {
            paths: [require.resolve("react-dom")]
        })
    )
);

jest.mock(
    "rsuite/Button",
    () => ({ children, loading, appearance, color, size, ...rest }: any) => (
        <button type="button" {...rest}>
            {children}
        </button>
    )
);
jest.mock("rsuite/ButtonToolbar", () => ({ children }: any) => (
    <div>{children}</div>
));
jest.mock("rsuite/Loader", () => () => <span>loading</span>);
jest.mock("rsuite/Message", () => ({ children }: any) => (
    <div role="alert">{children}</div>
));
jest.mock("rsuite/Panel", () => ({ children }: any) => <div>{children}</div>);
jest.mock("rsuite/Modal", () => {
    const Modal = ({ open, children, role, ...rest }: any) =>
        open ? (
            <div role={role} aria-labelledby={rest["aria-labelledby"]}>
                {children}
            </div>
        ) : null;
    Modal.Header = ({ children }: any) => <div>{children}</div>;
    Modal.Title = ({ children, id }: any) => <h4 id={id}>{children}</h4>;
    Modal.Body = ({ children }: any) => <div>{children}</div>;
    Modal.Footer = ({ children }: any) => <div>{children}</div>;
    return Modal;
});
jest.mock("./Breadcrumb", () => () => null);
jest.mock("./SideNavigation", () => () => null);

const mockStatus = jest.fn();
const mockRetry = jest.fn();
jest.mock("../../api-clients/AgentWorkspaceApis", () => ({
    AGENT_WORKSPACE_RUNTIME_URL: "/api/v0/agent/runtime/",
    getAgentWorkspaceStatus: (...args: any[]) => mockStatus(...args),
    retryAgentWorkspaceSkillSync: (...args: any[]) => mockRetry(...args),
    isAgentWorkspacePollingState: () => false,
    isAgentWorkspaceRunning: (state: string) => state === "READY",
    startAgentWorkspaceStatusPolling: () => () => undefined,
    deleteAgentWorkspace: jest.fn(),
    resetAgentWorkspace: jest.fn(),
    resumeAgentWorkspace: jest.fn(),
    startAgentWorkspace: jest.fn()
}));

// eslint-disable-next-line import/first
import AgentWorkspacePage, {
    SkillSyncStatusBanner
} from "./AgentWorkspacePage";

const counts = (overrides: Record<string, number> = {}) => ({
    installed: 0,
    updated: 0,
    unchanged: 0,
    removed: 0,
    skipped: 0,
    failed: 0,
    ...overrides
});

const partial = {
    status: "partial" as const,
    counts: counts({ installed: 1, skipped: 1 }),
    problems: [
        {
            name: "csv-clean",
            action: "skipped" as const,
            code: "LOCAL_MODIFICATION"
        }
    ]
};

describe("SkillSyncStatusBanner", () => {
    const html = (props: any) =>
        renderToStaticMarkup(
            <SkillSyncStatusBanner onRetry={() => undefined} {...props} />
        );

    it("offers Retry only after partial or failed Manager syncs", () => {
        expect(html({ skillSync: partial })).toContain(
            "Retry / Re-check skill sync"
        );
        expect(
            html({
                skillSync: { status: "failed", counts: counts({ failed: 1 }) }
            })
        ).toContain("Retry / Re-check skill sync");
        for (const status of ["success", "notAttempted"]) {
            expect(html({ skillSync: { status } })).not.toContain(
                "Retry / Re-check"
            );
        }
        expect(
            html({ skillSync: { ...partial, inProgress: true } })
        ).not.toContain("Retry / Re-check");
    });

    it("shows counts and sanitized per-skill reasons", () => {
        const markup = html({ skillSync: partial });
        expect(markup).toContain("1 installed, 1 kept or skipped");
        expect(markup).toContain("csv-clean");
        expect(markup).toContain("edited in this Workspace");
        expect(markup).toContain("Your Workspace remains available.");
    });

    it("explains a remote-source outage without blaming local files", () => {
        const markup = html({
            skillSync: {
                status: "failed",
                diagnosticCode: "REMOTE_SOURCE_FAILED",
                counts: counts({ failed: 1 })
            }
        });
        expect(markup).toContain("No installed skills were changed.");
    });

    it("renders nothing without Manager status", () => {
        expect(html({})).toBe("");
    });
});

describe("Open Workspace Retry / Re-check", () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeAll(() => {
        (global as any).IS_REACT_ACT_ENVIRONMENT = true;
    });

    beforeEach(() => {
        mockStatus.mockReset();
        mockRetry.mockReset();
        mockStatus.mockResolvedValue({ state: "READY", skillSync: partial });
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

    function button(label: string) {
        const match = Array.from(
            container.querySelectorAll<HTMLButtonElement>("button")
        ).find((item) => item.textContent === label);
        if (!match) throw new Error(`No button ${label}`);
        return match;
    }

    async function click(label: string) {
        act(() => button(label).click());
        await flush();
    }

    async function render() {
        act(() => root.render(<AgentWorkspacePage />));
        await flush();
    }

    it("keeps DSH embedded and makes no request when the confirmation is cancelled", async () => {
        await render();
        expect(container.querySelector("iframe")?.getAttribute("src")).toBe(
            "/api/v0/agent/runtime/"
        );
        await click("Retry / Re-check skill sync");
        const dialog = container.querySelector('[role="alertdialog"]');
        expect(dialog?.textContent).toContain("may be replaced or removed");
        await click("Cancel");
        expect(container.querySelector('[role="alertdialog"]')).toBeNull();
        expect(mockRetry).not.toHaveBeenCalled();
    });

    it("runs one confirmed retry and shows the Manager result", async () => {
        let resolveRetry!: (value: any) => void;
        mockRetry.mockReturnValue(
            new Promise((resolve) => {
                resolveRetry = resolve;
            })
        );
        await render();
        await click("Retry / Re-check skill sync");
        await click("Replace local changes and re-check");

        expect(mockRetry).toHaveBeenCalledTimes(1);
        expect(mockRetry).toHaveBeenCalledWith();
        expect(container.textContent).toContain(
            "Checking your published skills"
        );
        // No second Retry can be submitted while the attempt runs.
        expect(
            Array.from(container.querySelectorAll("button")).some(
                (item) => item.textContent === "Retry / Re-check skill sync"
            )
        ).toBe(false);

        await act(async () => {
            resolveRetry({
                completed: true,
                deduplicated: false,
                skillSync: { status: "success", counts: counts({ updated: 1 }) }
            });
        });
        await flush();
        expect(container.textContent).toContain(
            "Your published skills are up to date."
        );
        expect(container.querySelector("iframe")).not.toBeNull();
    });

    it("reports a failed retry request without leaving the Workspace", async () => {
        mockRetry.mockRejectedValue(
            new Error(
                "Agent Workspace must be ready before skills can be re-checked"
            )
        );
        await render();
        await click("Retry / Re-check skill sync");
        await click("Replace local changes and re-check");
        expect(
            container.querySelector('[role="alert"]')?.textContent
        ).toContain("Skill re-check failed");
        expect(container.querySelector("iframe")).not.toBeNull();
    });
});
