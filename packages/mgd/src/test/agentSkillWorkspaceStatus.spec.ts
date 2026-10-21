import { expect } from "chai";
import {
    WORKSPACE_STATUS_MAX_PROBLEMS,
    workspaceStatusSummary
} from "../commands/agentSkillOutput.js";
import type { AgentSkillSyncResult } from "../agentSkillTypes.js";
import { failedSyncResult } from "../agentSkillSync.js";

function result(
    overrides: Partial<AgentSkillSyncResult> = {}
): AgentSkillSyncResult {
    return {
        status: "partial",
        counts: {
            installed: 1,
            updated: 0,
            unchanged: 2,
            removed: 0,
            skipped: 1,
            failed: 1
        },
        manifestWarnings: 0,
        items: [
            {
                ref: { type: "user", id: "agent-skill-u-csv" },
                name: "csv-clean",
                action: "installed",
                harness: "dsh",
                path: "/data/home/.dsh/skills/csv-clean"
            },
            {
                ref: { type: "user", id: "agent-skill-u-edited" },
                name: "edited-skill",
                action: "skipped",
                code: "LOCAL_CHANGES",
                harness: "dsh",
                path: "/data/home/.dsh/skills/edited-skill"
            },
            {
                ref: { type: "system", id: "agent-skill-system-x" },
                name: "system-x",
                action: "failed",
                code: "OPERATION_FAILED",
                path: "/data/home/.dsh/skills/system-x"
            }
        ],
        conflicts: [
            {
                name: "edited-skill",
                harness: "dsh",
                path: "/data/home/.dsh/skills/edited-skill",
                reason: "local changes",
                detail: "SKILL.md differs",
                remedy: "publish or --force"
            }
        ],
        ...overrides
    };
}

describe("Workspace sync status summary", () => {
    it("reports counts and problem codes without paths or conflict details", () => {
        const summary = workspaceStatusSummary(result());
        expect(summary).to.deep.equal({
            status: "partial",
            counts: result().counts,
            manifestWarnings: 0,
            problems: [
                {
                    name: "edited-skill",
                    action: "skipped",
                    code: "LOCAL_CHANGES"
                },
                {
                    name: "system-x",
                    action: "failed",
                    code: "OPERATION_FAILED"
                }
            ]
        });
        expect(JSON.stringify(summary)).to.not.include("/data/");
        expect(JSON.stringify(summary)).to.not.include("SKILL.md differs");
    });

    it("flags a remote-source failure", () => {
        const summary = workspaceStatusSummary(
            result({
                status: "failed",
                remoteSourceFailed: true,
                items: [
                    {
                        ref: { type: "user", id: "manifest" },
                        name: "manifest",
                        action: "failed",
                        code: "DOWNLOAD_FAILED"
                    }
                ]
            })
        );
        expect(summary.remoteSourceFailed).to.equal(true);
        expect(summary.problems).to.deep.equal([
            { name: "manifest", action: "failed", code: "DOWNLOAD_FAILED" }
        ]);
    });

    it("treats an unavailable manifest as a remote failure with no local change", () => {
        const summary = workspaceStatusSummary(failedSyncResult());
        expect(summary.remoteSourceFailed).to.equal(true);
        expect(summary.problems).to.deep.equal([
            { name: "manifest", action: "failed", code: "MANIFEST_UNAVAILABLE" }
        ]);
        expect(
            workspaceStatusSummary(failedSyncResult("PROFILE_CHANGED"))
                .remoteSourceFailed
        ).to.equal(undefined);
    });

    it("bounds and sanitises the problem list", () => {
        const items = Array.from(
            { length: WORKSPACE_STATUS_MAX_PROBLEMS + 5 },
            (_, index) => ({
                ref: { type: "user" as const, id: `id-${index}` },
                name: index === 0 ? "../../etc/passwd" : `skill-${index}`,
                action: "failed" as const,
                code: index === 1 ? "lower case: message" : "DOWNLOAD_FAILED"
            })
        );
        const summary = workspaceStatusSummary(result({ items }));
        expect(summary.problems).to.have.lengthOf(
            WORKSPACE_STATUS_MAX_PROBLEMS
        );
        expect(summary.problemsTruncated).to.equal(true);
        expect(summary.problems[0].name).to.equal("unnamed");
        expect(summary.problems[1].code).to.equal("UNKNOWN");
    });
});
