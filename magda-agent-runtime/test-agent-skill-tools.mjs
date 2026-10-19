// Deterministic tests for the trusted Agent Skill DSH tools (#3856): fixed
// mgd argv without a shell, Workspace path confinement, the single
// chat-or-question-UI confirmation, and the publication outcome taxonomy.
// A mock `mgd` executable records its argv and replays scripted results.
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
    classifyWriteFailure,
    createAgentSkillOperations,
    sanitize
} from "./dsh-agent-skill-tools/lib/operations.js";

const here = (relative) => fileURLToPath(new URL(relative, import.meta.url));
const root = fs.realpathSync(
    await mkdtemp(path.join(tmpdir(), "magda-agent-skill-tools-"))
);
const workspace = path.join(root, "workspace");
const cwd = path.join(workspace, "agent-harness", "default-workspace");
const skills = path.join(root, "agent-home", "skills");
const outside = path.join(root, "outside");
const log = path.join(root, "mgd.log");
const scenarioFile = path.join(root, "scenario.json");
const mgdBin = path.join(root, "mgd");

fs.mkdirSync(path.join(cwd, "skill-drafts", "good"), { recursive: true });
fs.writeFileSync(path.join(cwd, "skill-drafts", "good", "SKILL.md"), "x");
fs.mkdirSync(path.join(skills, "installed"), { recursive: true });
fs.writeFileSync(
    path.join(skills, "installed", ".magda-skill-install.json"),
    "{}"
);
fs.mkdirSync(path.join(skills, "unmarked"), { recursive: true });
fs.mkdirSync(outside, { recursive: true });
fs.symlinkSync(outside, path.join(cwd, "skill-drafts", "escape"));
fs.writeFileSync(
    mgdBin,
    `#!${process.execPath}
const fs = require("fs");
fs.appendFileSync(${JSON.stringify(
        log
    )}, JSON.stringify(process.argv.slice(2)) + "\\n");
const scenario = JSON.parse(fs.readFileSync(${JSON.stringify(
        scenarioFile
    )}, "utf8"));
const step = scenario[process.argv[3]] || { stdout: "{}" };
if (step.createOutput) {
    const argv = process.argv.slice(2);
    fs.mkdirSync(argv[argv.indexOf("--output") + 1]);
}
const finish = () => {
    if (step.stdout) process.stdout.write(typeof step.stdout === "string" ? step.stdout : JSON.stringify(step.stdout));
    if (step.stderr) process.stderr.write(JSON.stringify(step.stderr) + "\\n");
    process.exit(step.code || 0);
};
step.sleepMs ? setTimeout(finish, step.sleepMs) : finish();
`,
    { mode: 0o755 }
);

const publication = {
    id: "agent-skill-00000000-0000-4000-8000-000000000123-good",
    type: "user",
    name: "good",
    checksum: "a".repeat(64),
    updatedAt: "2026-10-19T00:00:00.000Z",
    ownerId: "00000000-0000-4000-8000-000000000123",
    // Fields the tool must never pass through.
    apiKey: "SECRET-KEY-VALUE",
    description: "x"
};
const validated = { stdout: { name: "good", type: "user" } };
function scenario(steps) {
    fs.writeFileSync(scenarioFile, JSON.stringify(steps));
    fs.writeFileSync(log, "");
}
const calls = () =>
    fs
        .readFileSync(log, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line));
const ops = (options = {}) =>
    createAgentSkillOperations({
        mgdBin,
        workspaceRoot: workspace,
        skillsRoot: skills,
        env: { PATH: process.env.PATH, MAGDA_SECRET: "never-used" },
        ...options
    });
function asker(answer) {
    const asked = [];
    const ask = async (questions) => {
        asked.push(questions);
        if (answer instanceof Error) throw answer;
        return answer;
    };
    return { ask, asked };
}
const choose = (label, custom) => ({
    answers: [
        {
            id: "confirm",
            selected: label ? [label] : [],
            ...(custom ? { custom } : {})
        }
    ]
});
const draft = path.join(cwd, "skill-drafts", "good");

try {
    // --- Chat-approved publish: no question, fixed argv, bounded result.
    scenario({
        validate: validated,
        publish: { stdout: { ...publication, localCache: "updated" } }
    });
    let ui = asker(choose("Publish"));
    let result = await ops().publish(
        { path: "skill-drafts/good", userApproved: true },
        { cwd, ask: ui.ask }
    );
    assert.equal(result.outcome, "published");
    assert.equal(
        ui.asked.length,
        0,
        "Chat approval must not show another question"
    );
    assert.deepEqual(calls(), [
        ["agent-skill", "validate", draft, "--type", "user", "--json"],
        ["agent-skill", "publish", draft, "--type", "user", "--json"]
    ]);
    assert.deepEqual(result.publication, {
        type: "user",
        id: publication.id,
        name: "good",
        checksum: publication.checksum,
        updatedAt: publication.updatedAt,
        ownerId: publication.ownerId
    });
    assert.equal(result.localCache, "updated");
    assert.doesNotMatch(JSON.stringify(result), /SECRET-KEY-VALUE/);

    // --- Not yet approved: one question, Publish continues the same call.
    scenario({
        validate: validated,
        publish: { stdout: { ...publication, localCache: "updated" } }
    });
    ui = asker(choose("Publish"));
    result = await ops().publish({ path: draft }, { cwd, ask: ui.ask });
    assert.equal(result.outcome, "published");
    assert.equal(ui.asked.length, 1);
    const [userQuestion] = ui.asked[0];
    assert.deepEqual(
        userQuestion.options.map((option) => option.label),
        ["Publish", "Cancel"]
    );
    assert.match(userQuestion.question, /"good" to your MAGDA account/);
    assert.match(userQuestion.question, /future Agent Workspaces/);
    assert.doesNotMatch(userQuestion.question, /system skill/);
    assert.equal(
        calls().filter(([, command]) => command === "publish").length,
        1
    );

    // --- Cancel, custom text, dismissal/abort and no answerer never publish.
    for (const [answer, reason] of [
        [choose("Cancel"), "declined"],
        [choose(undefined, "maybe later"), "not-confirmed"],
        [choose("Publish", "but rename it first"), "not-confirmed"],
        [
            Object.assign(new Error("aborted"), { code: "ASK_ABORTED" }),
            "aborted"
        ],
        [
            Object.assign(new Error("none"), { code: "NO_PROVIDER" }),
            "unavailable"
        ],
        [{ answers: [] }, "not-confirmed"]
    ]) {
        scenario({ validate: validated, publish: { stdout: publication } });
        ui = asker(answer);
        result = await ops().publish(
            { path: draft, userApproved: false },
            { cwd, ask: ui.ask }
        );
        assert.equal(result.outcome, "cancelled");
        assert.equal(result.reason, reason);
        assert.ok(
            !calls().some(([, command]) => command === "publish"),
            reason
        );
    }
    scenario({ validate: validated, publish: { stdout: publication } });
    result = await ops().publish({ path: draft }, { cwd });
    assert.equal(result.reason, "unavailable", "No question UI fails closed");
    assert.ok(!calls().some(([, command]) => command === "publish"));

    // --- System skills: same tool and question, wider-effect wording.
    scenario({
        validate: { stdout: { name: "system-guide", type: "system" } },
        publish: {
            stdout: {
                ...publication,
                type: "system",
                id: "agent-skill-system-guide",
                name: "system-guide",
                localCache: "updated"
            }
        }
    });
    ui = asker(choose("Publish"));
    result = await ops().publish(
        { path: draft, type: "system" },
        { cwd, ask: ui.ask }
    );
    assert.equal(result.outcome, "published");
    assert.equal(ui.asked.length, 1);
    const systemQuestion = ui.asked[0][0].question;
    assert.match(
        systemQuestion,
        /This is a system skill\. Publishing it can make it available to other authorised MAGDA users and their Agent Workspaces, subject to system-skill visibility settings\./
    );
    assert.match(systemQuestion, /never available to anonymous users/);
    assert.deepEqual(
        ui.asked[0][0].options.map((o) => o.label),
        ["Publish", "Cancel"]
    );
    assert.deepEqual(calls()[1], [
        "agent-skill",
        "publish",
        draft,
        "--type",
        "system",
        "--json"
    ]);
    // Chat-approved system publication: no extra confirmation either.
    scenario({
        validate: { stdout: { name: "system-guide" } },
        publish: {
            stdout: { ...publication, type: "system", localCache: "updated" }
        }
    });
    ui = asker(choose("Cancel"));
    result = await ops().publish(
        { path: draft, type: "system", userApproved: true },
        { cwd, ask: ui.ask }
    );
    assert.equal(result.outcome, "published");
    assert.equal(ui.asked.length, 0);
    // Authorization is the backend's: a 403 is a confirmed rejection.
    scenario({
        validate: { stdout: { name: "system-guide" } },
        publish: {
            code: 3,
            stderr: {
                error: {
                    code: "forbidden",
                    status: 403,
                    message: "Not permitted to create system Agent Skills"
                }
            }
        }
    });
    result = await ops().publish(
        { path: draft, type: "system", userApproved: true },
        { cwd }
    );
    assert.equal(result.outcome, "rejected");
    assert.equal(result.error.status, 403);
    assert.match(result.guidance, /not permitted/);

    // --- Outcome taxonomy.
    const target = {
        operation: "create",
        type: "user",
        id: publication.id,
        name: "good",
        checksum: "b".repeat(64)
    };
    scenario({
        validate: validated,
        publish: {
            code: 1,
            stderr: {
                error: {
                    code: "network-error",
                    status: 0,
                    message: "Request failed: fetch failed (UND_ERR_SOCKET)",
                    outcome: "unknown",
                    details: { target }
                }
            }
        }
    });
    result = await ops().publish({ path: draft, userApproved: true }, { cwd });
    assert.equal(result.outcome, "uncertain");
    assert.deepEqual(result.target, target);
    assert.match(result.guidance, /Do not resend it/);
    assert.match(
        result.guidance,
        /do not immediately query a service that appears to be unavailable/
    );
    assert.equal(
        calls().filter(([, command]) => command === "publish").length,
        1,
        "Never retried"
    );
    assert.ok(
        !calls().some(
            ([, command]) => command === "show" || command === "list"
        ),
        "No automatic lookup"
    );

    for (const status of [400, 401, 403, 409, 412]) {
        scenario({
            validate: validated,
            publish: {
                code: 1,
                stderr: {
                    error: {
                        code: "request-failed",
                        status,
                        message: `HTTP ${status}`
                    }
                }
            }
        });
        result = await ops().publish(
            { path: draft, userApproved: true },
            { cwd }
        );
        assert.equal(result.outcome, "rejected", String(status));
        assert.equal(calls().length, 2);
    }
    assert.match(
        (
            await (async () => {
                scenario({
                    validate: validated,
                    publish: {
                        code: 1,
                        stderr: {
                            error: {
                                status: 409,
                                code: "conflict",
                                message: "exists"
                            }
                        }
                    }
                });
                return ops().publish(
                    { path: draft, userApproved: true },
                    { cwd }
                );
            })()
        ).guidance,
        /different name/
    );

    scenario({
        validate: validated,
        publish: {
            code: 1,
            stderr: {
                error: {
                    code: "network-error",
                    status: 0,
                    message: "Request failed: connect ECONNREFUSED",
                    outcome: "not-sent"
                }
            }
        }
    });
    result = await ops().publish({ path: draft, userApproved: true }, { cwd });
    assert.equal(result.outcome, "failed");
    assert.match(
        result.guidance,
        /could not be reached before the publish was sent/
    );

    scenario({
        validate: {
            code: 1,
            stderr: {
                error: {
                    code: "error",
                    message: "User Agent Skills may contain Markdown files only"
                }
            }
        }
    });
    result = await ops().publish({ path: draft, userApproved: true }, { cwd });
    assert.equal(result.outcome, "failed");
    assert.match(result.error.message, /Markdown files only/);
    assert.deepEqual(
        calls().map(([, command]) => command),
        ["validate"],
        "Invalid drafts are never published"
    );

    scenario({
        validate: validated,
        publish: { stdout: { ...publication, localCache: "failed" } }
    });
    result = await ops().publish({ path: draft, userApproved: true }, { cwd });
    assert.equal(result.outcome, "published");
    assert.equal(result.localCache, "failed");
    assert.match(
        result.guidance,
        /successful publication with a local-cache warning; do not publish it again/
    );

    scenario({
        validate: validated,
        publish: { sleepMs: 5000, stdout: publication }
    });
    result = await ops({ timeoutMs: 300 }).publish(
        { path: draft, userApproved: true },
        { cwd }
    );
    assert.equal(
        result.outcome,
        "uncertain",
        "A killed publish has an unknown outcome"
    );
    const abort = new AbortController();
    scenario({
        validate: validated,
        publish: { sleepMs: 5000, stdout: publication }
    });
    const pending = ops().publish(
        { path: draft, userApproved: true },
        { cwd, signal: abort.signal }
    );
    setTimeout(() => abort.abort(), 300);
    assert.equal((await pending).outcome, "uncertain");

    scenario({ validate: validated });
    result = await ops({ mgdBin: path.join(root, "missing-mgd") }).publish(
        { path: draft, userApproved: true },
        { cwd }
    );
    assert.equal(
        result.outcome,
        "failed",
        "A CLI that never started cannot have published"
    );

    assert.equal(
        classifyWriteFailure({ started: true, stderr: "" }, "publish").outcome,
        "uncertain",
        "An unrecognisable result from a started write is uncertain"
    );

    // --- Path confinement and no option/command injection.
    for (const bad of [
        "../../../outside",
        outside,
        "skill-drafts/escape",
        path.join(skills, "unmarked"),
        "skill-drafts/missing",
        "",
        "a\0b"
    ]) {
        scenario({ validate: validated, publish: { stdout: publication } });
        result = await ops().publish(
            { path: bad, userApproved: true },
            { cwd }
        );
        assert.equal(result.outcome, "failed", JSON.stringify(bad));
        assert.equal(result.error.code, "invalid-input");
        assert.deepEqual(calls(), [], "mgd never runs for rejected paths");
    }
    scenario({
        validate: validated,
        publish: { stdout: { ...publication, localCache: "updated" } }
    });
    result = await ops().publish(
        { path: path.join(skills, "installed"), userApproved: true },
        { cwd }
    );
    assert.equal(
        result.outcome,
        "published",
        "A marked installed copy is allowed"
    );
    fs.mkdirSync(path.join(cwd, "--help"));
    scenario({
        validate: validated,
        publish: { stdout: { ...publication, localCache: "updated" } }
    });
    await ops().publish({ path: "--help", userApproved: true }, { cwd });
    assert.equal(
        calls()[0][2],
        path.join(cwd, "--help"),
        "Paths are passed as absolute arguments"
    );
    scenario({ validate: validated, publish: { stdout: publication } });
    result = await ops().publish(
        { path: draft, type: "admin", userApproved: true },
        { cwd }
    );
    assert.equal(result.error.code, "invalid-input");
    assert.deepEqual(calls(), []);

    // --- Overwriting a newer remote version: same single question, explicit wording.
    scenario({
        validate: validated,
        publish: { stdout: { ...publication, localCache: "updated" } }
    });
    ui = asker(choose("Publish"));
    result = await ops().publish(
        { path: draft, overwriteRemoteChanges: true },
        { cwd, ask: ui.ask }
    );
    assert.equal(result.outcome, "published");
    assert.equal(ui.asked.length, 1, "Still a single confirmation");
    assert.match(
        ui.asked[0][0].question,
        /Publish "good" and overwrite the newer version currently stored in MAGDA\? Any changes made to that published version since your copy was created will be lost\./
    );
    assert.deepEqual(
        ui.asked[0][0].options.map((o) => o.label),
        ["Publish", "Cancel"]
    );
    assert.deepEqual(calls()[1], [
        "agent-skill",
        "publish",
        draft,
        "--type",
        "user",
        "--json",
        "--force"
    ]);
    scenario({
        validate: { stdout: { name: "system-guide" } },
        publish: { stdout: publication }
    });
    ui = asker(choose("Cancel"));
    result = await ops().publish(
        { path: draft, type: "system", overwriteRemoteChanges: true },
        { cwd, ask: ui.ask }
    );
    assert.equal(result.outcome, "cancelled");
    assert.match(ui.asked[0][0].question, /overwrite the newer version/);
    assert.match(ui.asked[0][0].question, /This is a system skill/);
    assert.ok(!calls().some(([, command]) => command === "publish"));
    scenario({
        validate: validated,
        publish: { stdout: { ...publication, localCache: "updated" } }
    });
    ui = asker(choose("Cancel"));
    result = await ops().publish(
        { path: draft, overwriteRemoteChanges: true, userApproved: true },
        { cwd, ask: ui.ask }
    );
    assert.equal(result.outcome, "published");
    assert.equal(
        ui.asked.length,
        0,
        "Explicit chat approval still skips the question"
    );
    scenario({ delete: { stdout: { deleted: true, localCache: "updated" } } });
    ui = asker(choose("Delete"));
    result = await ops().delete(
        { ref: `user/${publication.id}`, overwriteRemoteChanges: true },
        { cwd, ask: ui.ask }
    );
    assert.equal(result.outcome, "deleted");
    assert.match(
        ui.asked[0][0].question,
        /even though it has changed in MAGDA since this Workspace last saw it\? The published skill, including those newer changes, will be removed\./
    );
    assert.deepEqual(calls(), [
        ["agent-skill", "delete", `user/${publication.id}`, "--json", "--force"]
    ]);

    // --- Delete: same confirmation rule.
    scenario({
        delete: {
            stdout: {
                ref: { type: "user", id: publication.id },
                deleted: true,
                localCache: "updated"
            }
        }
    });
    ui = asker(choose("Delete"));
    result = await ops().delete(
        { ref: `user/${publication.id}` },
        { cwd, ask: ui.ask }
    );
    assert.equal(result.outcome, "deleted");
    assert.equal(ui.asked.length, 1);
    assert.deepEqual(calls(), [
        ["agent-skill", "delete", `user/${publication.id}`, "--json"]
    ]);
    scenario({ delete: { stdout: { deleted: true } } });
    ui = asker(choose("Cancel"));
    result = await ops().delete(
        { ref: "system/agent-skill-system-guide" },
        { cwd, ask: ui.ask }
    );
    assert.equal(result.outcome, "cancelled");
    assert.match(ui.asked[0][0].question, /This is a system skill/);
    assert.deepEqual(calls(), []);
    for (const bad of [
        "user/../x",
        "--force",
        "user/agent-skill-x; rm -rf /",
        "other/agent-skill-x"
    ]) {
        scenario({});
        result = await ops().delete({ ref: bad, userApproved: true }, { cwd });
        assert.equal(result.error.code, "invalid-input", bad);
        assert.deepEqual(calls(), []);
    }
    scenario({
        delete: {
            code: 1,
            stderr: {
                error: {
                    status: 504,
                    code: "server-error",
                    message: "Gateway Timeout",
                    outcome: "unknown"
                }
            }
        }
    });
    result = await ops().delete(
        { ref: `user/${publication.id}`, userApproved: true },
        { cwd }
    );
    assert.equal(result.outcome, "uncertain");

    // --- Sync: plain sync needs no question; force needs approval.
    const items = Array.from({ length: 60 }, (_, i) => ({
        name: `s${i}`,
        action: "installed",
        path: `/data/agent-home/skills/s${i}`
    }));
    scenario({
        sync: {
            code: 0,
            stdout: { status: "success", counts: { installed: 60 }, items }
        }
    });
    ui = asker(choose("Replace"));
    result = await ops().sync({}, { cwd, ask: ui.ask });
    assert.equal(result.outcome, "success");
    assert.equal(result.items.length, 50);
    assert.equal(result.moreItems, 10);
    assert.equal(ui.asked.length, 0);
    assert.deepEqual(calls(), [["agent-skill", "sync", "--json"]]);
    scenario({
        sync: { stdout: { status: "success", counts: {}, items: [] } }
    });
    ui = asker(choose("Cancel"));
    result = await ops().sync({ force: true }, { cwd, ask: ui.ask });
    assert.equal(result.outcome, "cancelled");
    assert.deepEqual(calls(), []);
    scenario({
        sync: {
            code: 1,
            stdout: {
                status: "partial",
                counts: { skipped: 1 },
                items: [
                    { name: "a", action: "skipped", code: "LOCAL_MODIFICATION" }
                ]
            }
        }
    });
    result = await ops().sync({ force: false }, { cwd });
    assert.equal(
        result.outcome,
        "partial",
        "A nonzero sync still reports its structured result"
    );

    // --- Pull: a new Workspace directory only.
    scenario({ pull: { stdout: { ...publication, directory: "x" } } });
    result = await ops().pull(
        { ref: `user/${publication.id}`, output: "skill-drafts/pulled" },
        { cwd }
    );
    assert.equal(result.outcome, "pulled");
    assert.deepEqual(calls(), [
        [
            "agent-skill",
            "pull",
            `user/${publication.id}`,
            "--output",
            path.join(cwd, "skill-drafts", "pulled"),
            "--json"
        ]
    ]);
    // A failed pull says whether a (possibly complete) copy was left behind.
    scenario({
        pull: {
            code: 1,
            createOutput: true,
            stderr: {
                error: { code: "error", message: "EIO: state write failed" }
            }
        }
    });
    result = await ops().pull(
        { ref: `user/${publication.id}`, output: "skill-drafts/partial" },
        { cwd }
    );
    assert.equal(result.outcome, "failed");
    assert.equal(result.directoryCreated, true);
    assert.match(
        result.guidance,
        /now exists and may already contain the downloaded skill/
    );
    scenario({
        pull: {
            code: 1,
            stderr: {
                error: { code: "not-found", status: 404, message: "Not found" }
            }
        }
    });
    result = await ops().pull(
        { ref: `user/${publication.id}`, output: "skill-drafts/never" },
        { cwd }
    );
    assert.equal(result.directoryCreated, false);
    assert.match(
        result.guidance,
        /Nothing was pulled; the output directory was not created/
    );
    for (const bad of [
        "skill-drafts/good",
        outside + "/new",
        "../../../../x",
        "missing-parent/x"
    ]) {
        scenario({});
        result = await ops().pull(
            { ref: `user/${publication.id}`, output: bad },
            { cwd }
        );
        assert.equal(result.error.code, "invalid-input", bad);
        assert.deepEqual(calls(), []);
    }

    // --- Messages are bounded and scrubbed.
    assert.equal(
        sanitize("X-Magda-API-Key: abc123def"),
        "X-Magda-API-Key: [REDACTED]"
    );
    assert.match(
        sanitize("Authorization: Bearer abcdefghijkl"),
        /\[REDACTED\]/
    );
    assert.ok(sanitize("x".repeat(5000)).length <= 601);

    // --- Integration with the real mgd CLI (when built) and a mock MAGDA.
    const realMgd = here("../packages/mgd/bin/mgd.js");
    if (fs.existsSync(realMgd)) {
        const userId = "00000000-0000-4000-8000-000000000123";
        let postMode = "drop";
        const server = http.createServer((req, res) => {
            const chunks = [];
            req.on("data", (chunk) => chunks.push(chunk));
            req.on("end", () => {
                if (req.url === "/api/v0/agent/skills/local-sync-manifest") {
                    res.writeHead(200, { "content-type": "application/json" });
                    res.end(
                        JSON.stringify({
                            version: 1,
                            complete: true,
                            identity: { tenantId: "0", userId },
                            items: [],
                            warnings: [],
                            sources: {
                                user: {
                                    status: "complete",
                                    selected: 0,
                                    warnings: 0
                                },
                                installations: { status: "notImplemented" }
                            }
                        })
                    );
                } else if (req.method === "POST" && postMode === "drop") {
                    req.socket.destroy();
                } else if (req.method === "POST") {
                    res.writeHead(409, { "content-type": "application/json" });
                    res.end(
                        JSON.stringify({
                            message: "An Agent Skill named good already exists"
                        })
                    );
                } else {
                    res.writeHead(404);
                    res.end();
                }
            });
        });
        await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
        const realOps = (baseUrl) =>
            createAgentSkillOperations({
                mgdBin: realMgd,
                workspaceRoot: workspace,
                skillsRoot: skills,
                env: {
                    PATH: process.env.PATH,
                    MGD_BASE_URL: baseUrl,
                    XDG_CONFIG_HOME: path.join(root, "real-config"),
                    XDG_DATA_HOME: path.join(root, "real-data"),
                    MGD_AGENT_SKILL_DIR: path.join(root, "real-skills")
                }
            });
        fs.writeFileSync(
            path.join(draft, "SKILL.md"),
            "---\nname: good\ndescription: A good skill\n---\n\n# Good\n\nSteps.\n"
        );
        try {
            const base = `http://127.0.0.1:${server.address().port}/api`;
            result = await realOps(base).publish(
                { path: draft, userApproved: true },
                { cwd }
            );
            assert.equal(result.outcome, "uncertain", JSON.stringify(result));
            assert.equal(result.target.id, `agent-skill-${userId}-good`);
            assert.match(result.target.checksum, /^[0-9a-f]{64}$/);
            postMode = "conflict";
            result = await realOps(base).publish(
                { path: draft, userApproved: true },
                { cwd }
            );
            assert.equal(result.outcome, "rejected");
            assert.equal(result.error.status, 409);
            assert.match(result.guidance, /different name/);
        } finally {
            await new Promise((resolve) => server.close(resolve));
        }
        const closed = http.createServer();
        await new Promise((resolve) => closed.listen(0, "127.0.0.1", resolve));
        const closedPort = closed.address().port;
        await new Promise((resolve) => closed.close(resolve));
        result = await realOps(`http://127.0.0.1:${closedPort}/api`).publish(
            { path: draft, userApproved: true },
            { cwd }
        );
        assert.equal(
            result.outcome,
            "failed",
            "An unreachable service fails before sending"
        );
    } else
        console.log(
            "test-agent-skill-tools: real mgd not built; integration case skipped"
        );

    // --- Image and DSH wiring.
    const index = await readFile(
        here("dsh-agent-skill-tools/lib/index.js"),
        "utf8"
    );
    const operations = await readFile(
        here("dsh-agent-skill-tools/lib/operations.js"),
        "utf8"
    );
    for (const tool of [
        "magda_agent_skill_publish",
        "magda_agent_skill_delete",
        "magda_agent_skill_sync",
        "magda_agent_skill_pull"
    ])
        assert.match(index, new RegExp(`name: "${tool}"`));
    assert.match(index, /ctx\.userQuestions\.ask\(/);
    assert.match(index, /wait: \{ callId: exec\.callId \}/);
    assert.doesNotMatch(index, /ctx\.approval|danger-full-access/);
    assert.match(operations, /shell: false/);
    assert.doesNotMatch(
        operations,
        /child_process"[^;]*\b(exec|execSync|spawnSync)\b|shell: true/,
        "mgd must only be started with execFile and no shell"
    );
    assert.match(
        operations,
        /import \{ execFile \} from "node:child_process";/
    );
} finally {
    await rm(root, { recursive: true, force: true });
}

console.log("test-agent-skill-tools: ok");
