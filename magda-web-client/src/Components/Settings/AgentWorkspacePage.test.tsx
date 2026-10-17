import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AgentWorkspaceReady } from "./AgentWorkspacePage";

jest.mock("rsuite/Button", () => "button");
jest.mock("rsuite/ButtonToolbar", () => "div");
jest.mock("rsuite/Loader", () => "div");
jest.mock("rsuite/Message", () => "div");
jest.mock("rsuite/Modal", () => "div");
jest.mock("rsuite/Panel", () => "div");
jest.mock("./Breadcrumb", () => () => null);
jest.mock("./SideNavigation", () => () => null);
jest.mock("../../api-clients/AgentWorkspaceApis", () => ({
    AGENT_WORKSPACE_RUNTIME_URL: "/api/v0/agent/runtime/",
    deleteAgentWorkspace: jest.fn(),
    getAgentWorkspaceStatus: jest.fn(),
    isAgentWorkspacePollingState: jest.fn(),
    isAgentWorkspaceRunning: jest.fn(),
    resetAgentWorkspace: jest.fn(),
    resumeAgentWorkspace: jest.fn(),
    startAgentWorkspace: jest.fn(),
    startAgentWorkspaceStatusPolling: jest.fn()
}));

const failedSync = {
    status: "failed" as const,
    attemptedAt: "2026-10-15T00:00:00.000Z",
    completedAt: "2026-10-15T00:00:01.000Z",
    counts: {
        installed: 0,
        updated: 0,
        unchanged: 0,
        removed: 0,
        skipped: 0,
        failed: 1
    }
};

describe("AgentWorkspaceReady", () => {
    it("keeps the runtime iframe available while surfacing sync failure guidance", () => {
        const html = renderToStaticMarkup(
            <AgentWorkspaceReady skillSync={failedSync} />
        );
        expect(html).toContain('title="Agent Workspace"');
        expect(html).toContain("/api/v0/agent/runtime/");
        expect(html).toContain("Workspace remains available");
        expect(html).toContain("mgd agent-skill sync");
    });

    it("does not show recovery guidance after successful sync", () => {
        const html = renderToStaticMarkup(
            <AgentWorkspaceReady
                skillSync={{ ...failedSync, status: "success" }}
            />
        );
        expect(html).toContain('title="Agent Workspace"');
        expect(html).not.toContain("Workspace remains available");
    });
});
