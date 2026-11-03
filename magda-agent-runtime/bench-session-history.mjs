// Benchmark for magda-session-history (#3856): wall time and peak RSS of
// representative queries against short and long DSH-like session logs.
//
//   node bench-session-history.mjs [--turns 20,500,3000] [--helper path ...]
//
// Sessions use the row mix and sizes measured from a real pinned-DSH session
// (user ~1 KB, assistant with reasoning ~6.4 KB per step, tool call ~0.4 KB,
// tool result ~0.7 KB, step/turn markers, one system prompt and request
// header), written as checksummed Zstandard frames of 1-3 rows. Every query
// runs in a fresh process; RSS is that process's peak resident set size.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const args = process.argv.slice(2);
const option = (name, fallback) => {
    const index = args.indexOf(`--${name}`);
    return index === -1 ? fallback : args[index + 1];
};
const turnCounts = option("turns", "20,500,3000").split(",").map(Number);
const helpers = args.flatMap((arg, i) =>
    arg === "--helper" ? [args[i + 1]] : []
);
if (!helpers.length)
    helpers.push(
        fileURLToPath(new URL("session-history.mjs", import.meta.url))
    );

const words = "dataset distribution schema region revenue validation pandas csv records".split(
    " "
);
let seed = 7;
const prose = (bytes) => {
    let out = "";
    while (out.length < bytes) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        out += words[seed % words.length] + (seed % 13 === 0 ? ".\n" : " ");
    }
    return out.slice(0, bytes);
};
const text = (value) => [{ type: "text", text: value }];

function writeSession(root, id, turns) {
    const directory = path.join(root, "sessions", "--data-workspace--", id);
    fs.mkdirSync(directory, { recursive: true });
    const file = path.join(directory, "session.v4.jsonl.zstd");
    const fd = fs.openSync(file, "w");
    let pending = [];
    let seq = 0;
    let frames = 0;
    const flush = () => {
        if (!pending.length) return;
        fs.writeSync(
            fd,
            zlib.zstdCompressSync(Buffer.from(pending.join("")), {
                params: { [zlib.constants.ZSTD_c_checksumFlag]: 1 }
            })
        );
        frames++;
        pending = [];
    };
    const row = (type, data, group = 2) => {
        pending.push(
            `${JSON.stringify({
                type,
                seq: seq++,
                time: 1792321713000 + seq,
                data
            })}\n`
        );
        if (pending.length >= group) flush();
    };
    pending.push(
        `${JSON.stringify({
            type: "session",
            version: 4,
            id,
            createdAt: 1792321713000,
            cwd: "/data/workspace/agent-harness/default-workspace",
            isSeeded: false,
            delegationDepth: 0,
            agentPreset: "standard"
        })}\n`
    );
    flush();
    row(
        "system/message",
        {
            turn: 1,
            step: 1,
            message: { role: "system", content: text(prose(6000)) }
        },
        1
    );
    row(
        "request/header",
        {
            header: {
                config: { model: "magda-agent-default" },
                tools: [prose(26000)]
            }
        },
        1
    );
    row("session/title", { title: `Benchmark ${turns} turns` }, 1);
    for (let turn = 1; turn <= turns; turn++) {
        row("turn/start", { turn });
        row("user/message", {
            content: text(`Turn ${turn}: ${prose(900)}`),
            source: { kind: "user" }
        });
        for (let step = 1; step <= 3; step++) {
            row("step/start", { turn, step });
            row("assistant/message", {
                turn,
                step,
                message: {
                    role: "assistant",
                    content: [
                        { type: "reasoning", text: prose(5500) },
                        { type: "text", text: prose(800) }
                    ]
                }
            });
            row("tool/call", {
                turn,
                step,
                callId: `c${turn}-${step}`,
                name: "bash",
                arguments: JSON.stringify({ command: prose(300) })
            });
            row("tool/result", {
                turn,
                step,
                message: {
                    role: "tool",
                    content: text(prose(650)),
                    isError: false
                }
            });
            row("step/end", { turn, step });
        }
        row("turn/end", { turn, reason: { kind: "completed" } });
        if (turn % 200 === 0)
            row(
                "compaction/summary",
                {
                    compactionId: `k${turn}`,
                    summary: text(`## Summary ${turn}\n${prose(2400)}`)
                },
                1
            );
    }
    flush();
    fs.closeSync(fd);
    return { file, frames, lastSeq: seq - 1, bytes: fs.statSync(file).size };
}

function measure(helper, home, sessionId, queryArgs) {
    const script = `
const started = process.hrtime.bigint();
const m = await import(${JSON.stringify(helper)});
let out = "", error;
try { out = m.run(${JSON.stringify(
        queryArgs
    )}, { ...process.env, DSH_SESSION_ID: ${JSON.stringify(sessionId)} }); }
catch (e) { error = e.message; }
process.stdout.write(JSON.stringify({ ms: Number(process.hrtime.bigint() - started) / 1e6, maxRssMiB: process.resourceUsage().maxRSS / 1024, outBytes: out.length, error }));
`;
    const result = spawnSync(
        process.execPath,
        ["--input-type=module", "-e", script],
        {
            encoding: "utf8",
            env: { PATH: process.env.PATH, DSH_HOME: home },
            maxBuffer: 1024 * 1024
        }
    );
    try {
        return JSON.parse(result.stdout);
    } catch {
        return {
            error: (result.stderr || "no output").split("\n").find(Boolean)
        };
    }
}

const home = mkdtempSync(path.join(tmpdir(), "magda-history-bench-"));
try {
    const rows = [];
    for (const turns of turnCounts) {
        const id = `bench-${turns}`;
        const session = writeSession(home, id, turns);
        const queries = {
            list: ["list"],
            outline: ["outline", "--session", id],
            "events (first page)": ["events", "--session", id, "--limit", "20"],
            "events (last page)": [
                "events",
                "--session",
                id,
                "--from-seq",
                String(Math.max(0, session.lastSeq - 40)),
                "--limit",
                "20"
            ],
            "events --grep (no match)": [
                "events",
                "--session",
                id,
                "--grep",
                "zz-no-such-text",
                "--limit",
                "20"
            ]
        };
        for (const helper of helpers)
            for (const [name, query] of Object.entries(queries)) {
                const result = measure(helper, home, id, query);
                rows.push({
                    session: `${turns} turns (${(
                        session.bytes / 1048576
                    ).toFixed(1)} MiB zstd, ${session.frames} frames)`,
                    helper: path.basename(helper),
                    query: name,
                    ms: result.ms === undefined ? "-" : Math.round(result.ms),
                    peakRssMiB:
                        result.maxRssMiB === undefined
                            ? "-"
                            : Math.round(result.maxRssMiB),
                    note: result.error ? result.error.slice(0, 80) : ""
                });
            }
    }
    console.log(`node ${process.version}`);
    console.table(rows);
} finally {
    rmSync(home, { recursive: true, force: true });
}
