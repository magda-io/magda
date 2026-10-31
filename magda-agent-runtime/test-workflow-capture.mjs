// Deterministic contract tests for #3856: the runtime-bundled capture-workflow
// skill, MAGDA's DSH prompt-section extension and the read-only session-history
// helper. Model behaviour is qualified separately on a real Workspace.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const here = (relative) => fileURLToPath(new URL(relative, import.meta.url));
const read = (relative) => readFile(here(relative), "utf8");

const dockerfile = await read("Dockerfile");
const entrypoint = await read("entrypoint.sh");
const cordisPatch = await read("magda.cordis.patch.yml");
const packageJson = JSON.parse(await read("package.json"));
const skill = await read("skills/capture-workflow/SKILL.md");

// --- Image wiring -----------------------------------------------------------
const bundledDir = "/usr/local/lib/magda-agent/skills";
assert.match(
    dockerfile,
    new RegExp(`DSH_BUNDLED_SKILL_DIR=${bundledDir}`),
    "DSH must discover runtime-bundled skills from the immutable image path"
);
assert.match(
    dockerfile,
    new RegExp(`COPY magda-agent-runtime/skills/ ${bundledDir}/`),
    "Bundled skills must be copied into the image, not synchronized"
);
assert.match(
    dockerfile,
    /chown -R root:root \/usr\/local\/lib\/magda-agent\/skills \/usr\/local\/lib\/magda-agent\/session-history\.mjs \\\n\s+&& chmod -R a\+rX,go-w \/usr\/local\/lib\/magda-agent\/skills/,
    "Bundled skills must be root-owned and read-only for the agent user"
);
assert.ok(
    dockerfile.indexOf("COPY magda-agent-runtime/skills/") <
        dockerfile.indexOf("USER 10001:10001"),
    "Bundled skills must be installed as root before switching user"
);
assert.match(dockerfile, /RUN mgd skills install --agent codex/);
assert.doesNotMatch(
    dockerfile,
    /agent-skill (publish|sync)/,
    "The image build must not publish or synchronize Registry skills"
);
assert.match(
    dockerfile,
    /ln -s \/usr\/local\/lib\/magda-agent\/session-history\.mjs \/usr\/local\/bin\/magda-session-history/
);
assert.match(
    dockerfile,
    /COPY magda-agent-runtime\/dsh-workflow-capture-guidance\/ \\\n\s+\/usr\/local\/lib\/node_modules\/@deepseek-ai\/dsh\/node_modules\/@magda\/dsh-workflow-capture-guidance\//
);
assert.match(
    entrypoint,
    /for managed_plugin in dsh-client-managed-profile dsh-workflow-capture-guidance dsh-agent-skill-tools; do/,
    "Both deployment-owned DSH plugins must be linked into the Web profile"
);
const includes = new Set(packageJson.config.docker.include.split(" "));
for (const required of [
    "../magda-agent-runtime/skills",
    "../magda-agent-runtime/dsh-workflow-capture-guidance",
    "../magda-agent-runtime/dsh-agent-skill-tools",
    "../magda-agent-runtime/session-history.mjs"
])
    assert.ok(
        includes.has(required),
        `Docker context must include ${required}`
    );

// --- Cordis overlay preserves DSH's own prompt configuration ----------------
assert.match(
    cordisPatch,
    /- insert:\n(?:\s+.*\n)*?\s+- id: magda-workflow-capture-guidance\n\s+name: "@magda\/dsh-workflow-capture-guidance"/,
    "The guidance must be an inserted, separately named plugin row"
);
assert.match(
    cordisPatch,
    /- insert:\n(?:\s+.*\n)*?\s+- id: magda-agent-skill-tools\n\s+name: "@magda\/dsh-agent-skill-tools"/,
    "The typed Agent Skill tools must be an inserted host plugin row"
);
assert.match(
    dockerfile,
    /COPY magda-agent-runtime\/dsh-agent-skill-tools\/ \\\n\s+\/usr\/local\/lib\/node_modules\/@deepseek-ai\/dsh\/node_modules\/@magda\/dsh-agent-skill-tools\//
);
assert.doesNotMatch(
    cordisPatch,
    /danger-full-access/,
    "The trusted tools must not widen the Bash sandbox or approval policy"
);
for (const preserved of [
    "system-prompt",
    "persona",
    "agent-instructions",
    "agent-preset-registry",
    "preset-standard",
    "preset-ptc",
    "preset-minimal",
    "preset-cordis",
    "skill-filesystem",
    "tool-skill"
])
    assert.doesNotMatch(
        cordisPatch,
        new RegExp(`^- id: ${preserved}\\n`, "m"),
        `Patching ${preserved} would replace DSH's own row configuration`
    );

const guidance = await import(
    here("dsh-workflow-capture-guidance/lib/index.js")
);
const guidancePackage = JSON.parse(
    await read("dsh-workflow-capture-guidance/package.json")
);
assert.equal(guidancePackage.name, "@magda/dsh-workflow-capture-guidance");
assert.equal(
    guidancePackage.dsh,
    undefined,
    "The guidance plugin is host-only"
);
assert.deepEqual(guidance.inject, ["systemPrompt"]);
const sections = [];
const effects = [];
guidance.apply({
    effect(callback, label) {
        effects.push(label);
        return callback();
    },
    systemPrompt: {
        section(section) {
            sections.push(section);
            return () => undefined;
        }
    }
});
assert.equal(effects.length, 1);
assert.equal(sections.length, 1);
const [section] = sections;
assert.equal(section.name, "magda:workflow-capture-suggestions");
assert.ok(
    !section.name.startsWith("deployment:") &&
        !section.name.startsWith("harness:"),
    "The section must not shadow a first-party DSH section"
);
// DSH 0.2.1-alpha.1 orders: DELIVERABLE_FILE_REFERENCES 9000,
// STRUCTURED_OUTPUT 9900, HARNESS_SOURCE 10000, DEPLOYMENT_PERSONA_SUFFIX 10200.
assert.ok(section.order > 9000 && section.order < 9900);
assert.equal(
    section.complete,
    undefined,
    "The guidance must never replace the prompt"
);
assert.equal(section.interpolate, false);
assert.equal(
    typeof section.text,
    "string",
    "Static text keeps the prompt cacheable"
);
assert.ok(section.text.length < 2000, "The prompt addition must stay small");
for (const required of [
    /capture-workflow/,
    /meets \*\*all\*\* of these conditions/,
    /several steps or tool calls/,
    /completed and verified it successfully/,
    /reused with other inputs/,
    /not already a saved or synchronized Agent Skill/,
    /declined/,
    /Otherwise do not offer/,
    /simple questions/,
    /failed, partial or unverified work/,
    /more than once per conversation/,
    /subagent/,
    /not consent/,
    /never publish a skill without the user's explicit approval/
])
    assert.match(section.text, required);

// --- Bundled skill -------------------------------------------------------
const frontmatter = /^---\n([\s\S]*?)\n---\n([\s\S]+)$/.exec(skill);
assert.ok(frontmatter, "SKILL.md needs YAML frontmatter and a body");
const fields = Object.fromEntries(
    frontmatter[1].split("\n").map((line) => {
        const index = line.indexOf(":");
        return [line.slice(0, index), line.slice(index + 1).trim()];
    })
);
assert.equal(fields.name, "capture-workflow");
assert.ok(fields.description.length > 0 && fields.description.length <= 1024);
assert.ok(
    !/: /.test(fields.description),
    "Plain YAML scalars must not contain ': '"
);
assert.ok(!/: /.test(fields.whenToUse));
assert.deepEqual(
    fs.readdirSync(here("skills")).sort(),
    ["capture-workflow", "python-dependencies"],
    "Only immediate skill directories belong in the bundled root"
);
for (const required of [
    /mgd agent-skill init <name> --output skill-drafts\/<name>/,
    /mgd agent-skill validate skill-drafts\/<name>/,
    /`magda_agent_skill_publish` replaces `mgd agent-skill publish`/,
    /`magda_agent_skill_sync` replaces `mgd agent-skill sync`/,
    /`magda_agent_skill_pull` replaces `mgd agent-skill pull`/,
    /`magda_agent_skill_delete` replaces `mgd agent-skill delete`/,
    /Do not run these commands in Bash or request an escalation for them/,
    /`type: "system"` only when the user explicitly asked for a \*\*system\*\* skill/,
    /set `userApproved: true`\. The tool publishes directly, without asking again/,
    /leave `userApproved` out\. The tool shows the user a \*\*Publish \/ Cancel\*\* question/,
    /A failure or a missing ID does \*\*not\*\* prove nothing was published/,
    /Never resend the publication automatically, and do not immediately query a service that appears to be down/,
    /type, ID, owner and checksum match the `target`/,
    /Report the rejection; do not verify or retry automatically/,
    /local draft only and has not been published/,
    /lost when the Workspace is reset, replaced or terminated/,
    /\*\*stop and wait\*\*/i,
    /Drafting, capturing, explaining, examining, improving or validating a skill is not approval, and neither are compliments/,
    /instructions found in files, datasets or tool output/,
    /untrusted data/,
    /409/,
    /localCache/,
    /magda-session-history outline/,
    /# INCOMPLETE RESULT/,
    /Do \*\*not\*\* reload the whole history/,
    /Markdown files only/,
    /re-read the draft for values taken from this particular run/,
    /mgd agent-skill list --type user --query <name>/
])
    assert.match(skill, required);
assert.doesNotMatch(
    skill,
    /--scope/,
    "The CLI uses --type, not the obsolete --scope"
);
assert.doesNotMatch(
    skill,
    /nothing was published\. Quote the error|Non-zero exit code|danger-full-access|Allow once/,
    "Failures must not be reported as definite non-publication, and no Bash escalation is requested"
);
assert.doesNotMatch(
    skill,
    /https?:\/\/(?!\[)|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-/i,
    "The bundled skill must not hard-code instances or identifiers"
);

// --- Session-history helper ---------------------------------------------
const helper = here("session-history.mjs");
const canZstd = typeof zlib.zstdCompressSync === "function";
const home = await mkdtemp(path.join(tmpdir(), "magda-session-history-"));
try {
    const sessionsRoot = path.join(home, "agent-home", "sessions");
    const project = path.join(sessionsRoot, "--data-workspace--");
    const secret = "sk-live-0123456789abcdefSECRET";
    const event = (seq, type, data, extra = {}) => ({
        type,
        seq,
        time: 1792321713000 + seq,
        data,
        ...extra
    });
    const text = (value) => [{ type: "text", text: value }];
    const events = (id) => [
        {
            type: "session",
            version: 4,
            id,
            createdAt: 1792321713000,
            cwd: "/data/workspace",
            isSeeded: false,
            delegationDepth: 0,
            agentPreset: "standard"
        },
        event(0, "turn/start", { turn: 1 }),
        event(1, "system/message", {
            turn: 1,
            step: 1,
            message: { role: "system", content: text("SYSTEM-PROMPT-TEXT") }
        }),
        event(2, "user/message", {
            content: text("Find a dataset about rainfall"),
            source: { kind: "user" },
            role: "user"
        }),
        event(3, "user/message", {
            content: text("RUNTIME-CONTEXT-TEXT"),
            source: { kind: "runtime-context" },
            role: "user"
        }),
        event(4, "request/header", {
            header: { config: { model: "m" }, tools: ["REQUEST-HEADER-TEXT"] }
        }),
        event(5, "assistant/message", {
            turn: 1,
            step: 1,
            message: {
                role: "assistant",
                content: [
                    { type: "reasoning", text: "PRIVATE-REASONING" },
                    { type: "text", text: "Searching." }
                ]
            }
        }),
        event(6, "tool/call", {
            turn: 1,
            step: 1,
            callId: "c1",
            name: "bash",
            arguments: JSON.stringify({
                command: `curl -H "X-Magda-API-Key: ${secret}" -H 'Authorization: Bearer abcdefghijklmnop' "https://x.test/a?token=t0ps3cr3t&x=1"`
            })
        }),
        event(7, "tool/result", {
            turn: 1,
            step: 1,
            message: {
                role: "tool",
                content: text(
                    `apiKey=${secret}\npassword: hunter22\nrows=42 ${"x".repeat(
                        20000
                    )}`
                ),
                isError: false
            }
        }),
        event(8, "tool/result", {
            turn: 1,
            step: 1,
            message: {
                role: "tool",
                content: text("validation failed"),
                isError: true
            }
        }),
        event(9, "turn/end", { turn: 1, reason: { kind: "completed" } }),
        event(10, "compaction/summary", {
            compactionId: "k",
            summary: text("## Summary\nRainfall analysis done.")
        }),
        event(11, "user/message", {
            content: text("CHECKPOINT"),
            source: { kind: "compact-checkpoint" },
            role: "user"
        }),
        event(12, "session/title", { title: "Rainfall analysis" }),
        ...Array.from({ length: 150 }, (_, i) =>
            event(100 + i, "tool/call", {
                turn: 2,
                step: 1,
                callId: `b${i}`,
                name: "read",
                arguments: "{}"
            })
        )
    ];
    const lines = (rows) => rows.map((row) => `${JSON.stringify(row)}\n`);
    const writeSession = (
        id,
        {
            version = 4,
            compressed = canZstd,
            rows = events(id),
            torn = false
        } = {}
    ) => {
        const directory = path.join(project, id);
        fs.mkdirSync(directory, { recursive: true });
        const file = path.join(
            directory,
            `session.v${version}.jsonl${compressed ? ".zstd" : ""}`
        );
        const [header, ...rest] = lines(rows);
        let bytes;
        if (compressed) {
            const frame = (value) =>
                zlib.zstdCompressSync(value, {
                    params: { [zlib.constants.ZSTD_c_checksumFlag]: 1 }
                });
            const batches = [
                header,
                rest.slice(0, 5).join(""),
                rest.slice(5).join("")
            ];
            bytes = Buffer.concat(batches.map(frame));
            if (torn)
                bytes = Buffer.concat([
                    bytes,
                    frame('{"type":"turn/start"}\n').subarray(0, 9)
                ]);
        } else {
            bytes = Buffer.from(
                header + rest.join("") + (torn ? '{"type":"turn/st' : "")
            );
        }
        fs.writeFileSync(file, bytes, { mode: 0o600 });
        fs.writeFileSync(path.join(directory, "session.lock"), "");
        return file;
    };
    const current = "session-current";
    writeSession(current, { torn: true });
    writeSession("session-raw", { compressed: false, torn: true });
    writeSession("session-future", { version: 5, compressed: false });
    // An escape attempt: a session directory and a log symlinked outside the root.
    const outside = path.join(home, "outside");
    fs.mkdirSync(outside);
    fs.writeFileSync(
        path.join(outside, "session.v4.jsonl"),
        lines(events("session-linked")).join("")
    );
    fs.symlinkSync(outside, path.join(project, "session-linked"));
    fs.mkdirSync(path.join(project, "session-linked-file"));
    fs.symlinkSync(
        path.join(outside, "session.v4.jsonl"),
        path.join(project, "session-linked-file", "session.v4.jsonl")
    );
    const launchToken = path.join(home, "dsh-launch-token");
    fs.writeFileSync(launchToken, "LAUNCH-TOKEN-VALUE", { mode: 0o600 });

    const snapshot = () =>
        Object.fromEntries(
            fs.readdirSync(sessionsRoot, { recursive: true }).map((entry) => {
                const target = path.join(sessionsRoot, entry);
                const stat = fs.lstatSync(target);
                return [
                    entry,
                    stat.isFile()
                        ? `${stat.mtimeMs}:${fs.readFileSync(target, "hex")}`
                        : stat.isSymbolicLink()
                        ? "link"
                        : "dir"
                ];
            })
        );
    const before = snapshot();
    const env = {
        PATH: process.env.PATH,
        DSH_HOME: path.join(home, "agent-home"),
        DSH_SESSION_ID: current,
        MAGDA_LLM_API_KEY: "llm-key-ABCDEFGHIJKLMNOP",
        DSH_LAUNCH_TOKEN_FILE: launchToken
    };
    const runHelper = (...args) => {
        const result = spawnSync(process.execPath, [helper, ...args], {
            encoding: "utf8",
            env
        });
        return { ...result, json: () => JSON.parse(result.stdout) };
    };

    const list = runHelper("list", "--json");
    assert.equal(list.status, 0, list.stderr);
    const listed = list.json().sessions;
    assert.equal(list.json().complete, true);
    assert.deepEqual(
        listed.map((s) => s.id).sort(),
        ["session-current", "session-future", "session-raw"],
        "Symlinked session directories and logs must be ignored"
    );
    assert.equal(listed.find((s) => s.id === current).current, true);
    assert.equal(
        listed.find((s) => s.id === current).title,
        "Rainfall analysis"
    );
    assert.match(
        listed.find((s) => s.id === "session-future").error,
        /unsupported DSH session format v5/
    );

    const outline = runHelper("outline", "--json");
    assert.equal(outline.status, 0, outline.stderr);
    const turns = outline.json();
    assert.equal(turns.session, current);
    assert.deepEqual(turns.compactions, [{ seq: 10, chars: 34 }]);
    assert.equal(turns.turns[0].request, "Find a dataset about rainfall");
    assert.equal(turns.turns[0].outcome, "completed");
    assert.equal(turns.turns[0].toolErrors, 1);
    assert.deepEqual(turns.turns[1].tools, { read: 150 });

    const all = runHelper(
        "events",
        "--limit",
        "1000",
        "--max-chars",
        "999999",
        "--json"
    );
    assert.equal(all.status, 0, all.stderr);
    const page = all.json();
    assert.equal(page.events.length, 100, "Event pages are capped");
    assert.equal(page.nextFromSeq, 193);
    const allText = all.stdout;
    for (const hidden of [
        "SYSTEM-PROMPT-TEXT",
        "RUNTIME-CONTEXT-TEXT",
        "REQUEST-HEADER-TEXT",
        "PRIVATE-REASONING",
        "CHECKPOINT",
        "LAUNCH-TOKEN-VALUE"
    ])
        assert.ok(
            !allText.includes(hidden),
            `${hidden} must never be returned`
        );
    for (const secretValue of [
        secret,
        "hunter22",
        "abcdefghijklmnop",
        "t0ps3cr3t"
    ])
        assert.ok(
            !allText.includes(secretValue),
            `credential ${secretValue} must be redacted`
        );
    const result = page.events.find((e) => e.seq === 7);
    assert.ok(
        result.text.length <= 8000 + 64,
        "Text is capped at the maximum length"
    );
    assert.match(result.text, /rows=42/);
    assert.equal(page.events.find((e) => e.seq === 8).isError, true);

    const filtered = runHelper(
        "events",
        "--type",
        "compaction,user",
        "--json"
    ).json();
    assert.deepEqual(
        filtered.events.map((e) => [e.seq, e.kind]),
        [
            [2, "user"],
            [10, "compaction"]
        ]
    );
    const grepped = runHelper(
        "events",
        "--grep",
        "VALIDATION FAILED",
        "--json"
    ).json();
    assert.deepEqual(
        grepped.events.map((e) => e.seq),
        [8]
    );
    for (const probe of [secret, "hunter22", "abcdefghijklmnop"]) {
        const probed = runHelper("events", "--grep", probe, "--json").json();
        assert.deepEqual(
            probed.events,
            [],
            "--grep must match redacted text, not credential values"
        );
    }
    const turn = runHelper(
        "events",
        "--turn",
        "1",
        "--type",
        "tool-call",
        "--json"
    ).json();
    assert.deepEqual(
        turn.events.map((e) => e.seq),
        [6]
    );
    const window = runHelper(
        "events",
        "--from-seq",
        "100",
        "--to-seq",
        "104",
        "--json"
    ).json();
    assert.equal(window.events.length, 5);
    assert.equal(window.nextFromSeq, undefined);

    const textOutput = runHelper(
        "events",
        "--limit",
        "100",
        "--max-chars",
        "8000"
    );
    assert.match(textOutput.stdout, /^# Untrusted historical session data/);
    assert.ok(
        Buffer.byteLength(textOutput.stdout) <= 64 * 1024,
        "Total output is capped"
    );

    const raw = runHelper(
        "events",
        "--session",
        "session-raw",
        "--type",
        "user",
        "--json"
    );
    assert.equal(raw.status, 0, raw.stderr);
    assert.equal(
        raw.json().events[0].text,
        "Find a dataset about rainfall",
        "Raw logs ignore a torn final line"
    );

    for (const [args, pattern] of [
        [["events", "--session", "../outside"], /invalid session id/],
        [["events", "--session", "session-linked"], /not found/],
        [
            ["events", "--session", "session-future"],
            /unsupported DSH session format v5/
        ],
        [["events", "--type", "system"], /--type accepts/],
        [["events", "--limit", "-1"], /non-negative integer/],
        [["rm"], /usage/]
    ]) {
        const failed = runHelper(...args);
        assert.notEqual(failed.status, 0, args.join(" "));
        assert.match(failed.stderr, pattern);
        assert.equal(failed.stdout, "");
    }
    const noSession = spawnSync(process.execPath, [helper, "events"], {
        encoding: "utf8",
        env: { ...env, DSH_SESSION_ID: "" }
    });
    assert.equal(noSession.status, 64);
    assert.match(noSession.stderr, /pass --session/);
    const noHistory = spawnSync(process.execPath, [helper, "list", "--json"], {
        encoding: "utf8",
        env: { ...env, DSH_HOME: path.join(home, "missing") }
    });
    assert.equal(noHistory.status, 0);
    assert.deepEqual(JSON.parse(noHistory.stdout), {
        sessions: [],
        complete: true
    });

    assert.deepEqual(
        snapshot(),
        before,
        "The helper must never modify session state"
    );
    if (!canZstd)
        console.log(
            "test-workflow-capture: zstd unavailable; compressed-log cases used raw logs"
        );
} finally {
    await rm(home, { recursive: true, force: true });
}

console.log("test-workflow-capture: ok");
