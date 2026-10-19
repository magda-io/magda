// Streaming tests for magda-session-history (#3856): DSH concatenated
// Zstandard frames processed one at a time, rows and UTF-8 sequences spanning
// frames, torn tails, oversized rows/frames, the decoded-work budget, early
// and late pages with exact pagination, and cheap `list`.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

if (typeof zlib.zstdCompressSync !== "function") {
    console.log("test-session-history: skipped (this Node has no zstd)");
    process.exit(0);
}

const helper = fileURLToPath(new URL("session-history.mjs", import.meta.url));
const home = await mkdtemp(path.join(tmpdir(), "magda-history-stream-"));
const sessionsDir = path.join(
    home,
    "agent-home",
    "sessions",
    "--data-workspace--"
);
const frame = (bytes) =>
    zlib.zstdCompressSync(bytes, {
        params: { [zlib.constants.ZSTD_c_checksumFlag]: 1 }
    });
const header = (id) => ({
    type: "session",
    version: 4,
    id,
    createdAt: 1792321713000,
    cwd: "/data/workspace",
    isSeeded: false,
    delegationDepth: 0,
    agentPreset: "standard"
});
const event = (seq, type, data) => ({
    type,
    seq,
    time: 1792321713000 + seq,
    data
});
const text = (value) => [{ type: "text", text: value }];

/** Write rows as frames split at the given byte offsets of the JSONL body. */
function writeSession(
    id,
    rows,
    { splits, perFrame = 1, torn = false, raw = false } = {}
) {
    const directory = path.join(sessionsDir, id);
    fs.mkdirSync(directory, { recursive: true });
    const lines = rows.map((row) => Buffer.from(`${JSON.stringify(row)}\n`));
    let body;
    if (raw) body = Buffer.concat(lines);
    else {
        const frames = [frame(lines[0])];
        if (splits) {
            const rest = Buffer.concat(lines.slice(1));
            let start = 0;
            for (const split of [...splits, rest.length]) {
                frames.push(frame(rest.subarray(start, split)));
                start = split;
            }
        } else
            for (let i = 1; i < lines.length; i += perFrame)
                frames.push(frame(Buffer.concat(lines.slice(i, i + perFrame))));
        if (torn)
            frames.push(
                frame(Buffer.from('{"type":"turn/start"}\n')).subarray(0, 11)
            );
        body = Buffer.concat(frames);
    }
    const file = path.join(directory, `session.v4.jsonl${raw ? "" : ".zstd"}`);
    fs.writeFileSync(file, body);
    return file;
}

const env = (extra = {}) => ({
    PATH: process.env.PATH,
    DSH_HOME: path.join(home, "agent-home"),
    ...extra
});
function query(args, extra = {}) {
    const result = spawnSync(process.execPath, [helper, ...args], {
        encoding: "utf8",
        env: env(extra),
        maxBuffer: 16 * 1024 * 1024
    });
    return {
        ...result,
        json: () => JSON.parse(result.stdout)
    };
}
const limits = (value) => ({
    MAGDA_SESSION_HISTORY_LIMITS: JSON.stringify(value)
});

/** A realistic long conversation: per turn a request, tool call/result, reply. */
function conversation(id, turnCount, { resultBytes = 400 } = {}) {
    const rows = [header(id)];
    let seq = 0;
    for (let turn = 1; turn <= turnCount; turn++) {
        rows.push(event(seq++, "turn/start", { turn }));
        rows.push(
            event(seq++, "system/message", {
                turn,
                message: { content: text("SYSTEM PROMPT ".repeat(20)) }
            })
        );
        rows.push(
            event(seq++, "user/message", {
                content: text(`request ${turn}`),
                source: { kind: "user" }
            })
        );
        rows.push(
            event(seq++, "tool/call", {
                turn,
                name: "bash",
                arguments: JSON.stringify({ command: `step ${turn}` })
            })
        );
        rows.push(
            event(seq++, "tool/result", {
                turn,
                message: {
                    content: text(`result ${turn} ${"r".repeat(resultBytes)}`),
                    isError: false
                }
            })
        );
        rows.push(
            event(seq++, "assistant/message", {
                turn,
                message: {
                    content: [
                        { type: "reasoning", text: "PRIVATE" },
                        { type: "text", text: `answer ${turn}` }
                    ]
                }
            })
        );
        rows.push(
            event(seq++, "turn/end", { turn, reason: { kind: "completed" } })
        );
        if (turn === Math.floor(turnCount / 2))
            rows.push(
                event(seq++, "compaction/summary", {
                    summary: text(`summary through turn ${turn}`)
                })
            );
    }
    rows.push(event(seq++, "session/title", { title: `Conversation ${id}` }));
    return rows;
}

try {
    // --- Rows and multi-byte UTF-8 split across frame boundaries.
    const unicode = "café 🚀 数据集";
    const rows = [
        header("split"),
        event(0, "turn/start", { turn: 1 }),
        event(1, "user/message", {
            content: text(`find ${unicode}`),
            source: { kind: "user" }
        }),
        event(2, "tool/result", {
            turn: 1,
            message: { content: text(`ok ${unicode}`) }
        }),
        event(3, "turn/end", { turn: 1, reason: { kind: "completed" } })
    ];
    const body = Buffer.concat(
        rows.slice(1).map((row) => Buffer.from(`${JSON.stringify(row)}\n`))
    );
    const rocket = body.indexOf(Buffer.from("🚀"));
    const accent = body.indexOf(Buffer.from("é"));
    const splits = [
        accent + 1,
        rocket + 2,
        body.indexOf(Buffer.from("数")) + 1
    ].sort((a, b) => a - b);
    writeSession("split", rows, { splits, torn: true });
    let result = query(["events", "--session", "split", "--json"]);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(
        result.json().events.map((e) => [e.seq, e.text]),
        [
            [1, `find ${unicode}`],
            [2, `ok ${unicode}`],
            [3, "completed"]
        ],
        "Rows and UTF-8 code points split across frames are reassembled exactly"
    );
    assert.equal(result.json().complete, true, "A torn final frame is ignored");

    // A tiny read window forces refills inside frame and block headers.
    result = query(
        ["events", "--session", "split", "--json"],
        limits({ readWindowBytes: 3 })
    );
    assert.deepEqual(
        result.json().events.map((e) => e.seq),
        [1, 2, 3]
    );

    // Raw (uncompressed) logs stream in bounded chunks too.
    writeSession("raw", [header("raw"), ...rows.slice(1)], { raw: true });
    result = query(
        ["events", "--session", "raw", "--json"],
        limits({ rawChunkBytes: 7 })
    );
    assert.deepEqual(
        result.json().events.map((e) => e.text),
        [`find ${unicode}`, `ok ${unicode}`, "completed"]
    );

    // --- Oversized row: skipped without buffering, result marked incomplete.
    writeSession("huge-row", [
        header("huge-row"),
        event(0, "turn/start", { turn: 1 }),
        event(1, "user/message", {
            content: text("before"),
            source: { kind: "user" }
        }),
        event(2, "tool/result", {
            turn: 1,
            message: { content: text("x".repeat(50_000)) }
        }),
        event(3, "assistant/message", {
            turn: 1,
            message: { content: text("after") }
        })
    ]);
    result = query(
        ["events", "--session", "huge-row", "--json"],
        limits({ maxRowBytes: 10_000 })
    );
    assert.equal(result.status, 3, "An incomplete result exits 3");
    assert.deepEqual(
        result.json().events.map((e) => e.text),
        ["before", "after"]
    );
    assert.equal(result.json().complete, false);
    assert.match(
        result.json().incomplete.reason,
        /skipped a row larger than 10000 bytes after seq 1/
    );
    const textResult = query(
        ["events", "--session", "huge-row"],
        limits({ maxRowBytes: 10_000 })
    );
    assert.match(textResult.stdout, /# INCOMPLETE RESULT: skipped a row/);
    assert.match(
        textResult.stdout,
        /Do not treat this as the complete history/
    );

    // --- Oversized decoded frame: skipped, incomplete, later frames still read.
    writeSession("huge-frame", [
        header("huge-frame"),
        event(0, "user/message", {
            content: text("first"),
            source: { kind: "user" }
        }),
        event(1, "tool/result", {
            turn: 1,
            message: { content: text("y".repeat(200_000)) }
        }),
        event(2, "user/message", {
            content: text("last"),
            source: { kind: "user" }
        })
    ]);
    result = query(
        ["events", "--session", "huge-frame", "--json"],
        limits({ maxFrameBytes: 100_000 })
    );
    assert.equal(result.status, 3);
    assert.deepEqual(
        result.json().events.map((e) => e.text),
        ["first", "last"]
    );
    assert.match(
        result.json().incomplete.reason,
        /decodes to more than 100000 bytes/
    );

    // --- A long conversation: 3,000 turns in single-row frames.
    const long = conversation("long", 3000);
    writeSession("long", long);
    const userSeqs = long
        .filter((row) => row.type === "user/message")
        .map((row) => row.seq);
    const lastUserSeq = userSeqs[userSeqs.length - 1];

    // Early page: stops after limit+1 matches.
    result = query([
        "events",
        "--session",
        "long",
        "--type",
        "user",
        "--limit",
        "5",
        "--json"
    ]);
    const early = result.json();
    assert.deepEqual(
        early.events.map((e) => e.text),
        ["request 1", "request 2", "request 3", "request 4", "request 5"]
    );
    assert.equal(early.nextFromSeq, userSeqs[5]);
    assert.ok(
        early.stats.framesDecoded < 60,
        `early page decoded ${early.stats.framesDecoded} frames`
    );

    // Late page: binary search decodes few frames instead of the whole log.
    result = query([
        "events",
        "--session",
        "long",
        "--from-seq",
        String(lastUserSeq - 30),
        "--type",
        "user",
        "--json"
    ]);
    const late = result.json();
    assert.deepEqual(
        late.events.map((e) => e.text),
        [
            "request 2996",
            "request 2997",
            "request 2998",
            "request 2999",
            "request 3000"
        ]
    );
    assert.equal(late.events[0].turn, 2996, "Turn context survives seeking");
    assert.ok(
        late.stats.framesDecoded < 100,
        `late page decoded ${late.stats.framesDecoded} frames`
    );

    // Pagination visits every match exactly once, in order.
    const seen = [];
    let cursor = 0;
    for (let page = 0; page < 40 && cursor !== undefined; page++) {
        const pageResult = query([
            "events",
            "--session",
            "long",
            "--from-seq",
            String(cursor),
            "--type",
            "user",
            "--limit",
            "100",
            "--json"
        ]).json();
        seen.push(...pageResult.events.map((e) => e.seq));
        cursor = pageResult.nextFromSeq;
    }
    assert.deepEqual(seen, userSeqs);

    // --to-seq stops reading early; --turn filters.
    result = query([
        "events",
        "--session",
        "long",
        "--from-seq",
        String(userSeqs[100]),
        "--to-seq",
        String(userSeqs[100] + 6),
        "--json"
    ]);
    assert.deepEqual(
        result.json().events.map((e) => e.kind),
        ["user", "tool-call", "tool-result", "assistant", "turn-end"]
    );
    assert.ok(result.json().events.every((e) => e.turn === 101));

    // Compaction summaries in the middle of a long log.
    result = query([
        "events",
        "--session",
        "long",
        "--type",
        "compaction",
        "--json"
    ]);
    assert.deepEqual(
        result.json().events.map((e) => e.text),
        ["summary through turn 1500"]
    );

    // Small read windows (forward and backward) give identical results.
    const windowed = query(
        [
            "events",
            "--session",
            "long",
            "--from-seq",
            String(lastUserSeq - 30),
            "--type",
            "user",
            "--json"
        ],
        limits({ readWindowBytes: 64 })
    ).json();
    assert.deepEqual(windowed.events, late.events);
    result = query(["list", "--json"], limits({ readWindowBytes: 64 }));
    assert.equal(
        result.json().find((s) => s.id === "long").title,
        "Conversation long"
    );

    // Excluded rows never appear even in the long log.
    result = query([
        "events",
        "--session",
        "long",
        "--from-seq",
        "0",
        "--limit",
        "100",
        "--max-chars",
        "8000"
    ]);
    assert.doesNotMatch(result.stdout, /SYSTEM PROMPT|PRIVATE/);

    // Decoded-work budget: explicit incomplete result with a resume cursor.
    result = query(
        ["events", "--session", "long", "--type", "compaction", "--json"],
        limits({ maxDecodedBytesPerQuery: 200_000 })
    );
    assert.equal(result.status, 3);
    const budgeted = result.json();
    assert.equal(budgeted.complete, false);
    assert.match(budgeted.incomplete.reason, /200000-byte decoded-work budget/);
    assert.ok(budgeted.incomplete.resumeFromSeq > 0);
    assert.deepEqual(
        budgeted.events,
        [],
        "The summary lies beyond the budget and is not invented"
    );

    // Outline: bounded turns, accurate count of the rest, no raw retention.
    result = query([
        "outline",
        "--session",
        "long",
        "--limit",
        "200",
        "--json"
    ]);
    const outline = result.json();
    assert.equal(outline.turns.length, 200);
    assert.equal(outline.more, 2800);
    assert.equal(outline.turns[199].request, "request 200");
    assert.deepEqual(outline.turns[0].tools, { bash: 1 });
    assert.equal(outline.title, "Conversation long");
    result = query([
        "outline",
        "--session",
        "long",
        "--from-turn",
        "2999",
        "--json"
    ]);
    assert.deepEqual(
        result.json().turns.map((t) => t.turn),
        [2999, 3000]
    );
    result = query(
        ["outline", "--session", "long", "--json"],
        limits({ maxDecodedBytesPerQuery: 300_000 })
    );
    assert.equal(result.status, 3);
    assert.ok(result.json().incomplete.scannedThroughSeq > 0);

    // list reads the header and the latest title, not the whole log.
    result = query(["list", "--json"], {
        ...limits({ maxDecodedBytesPerQuery: 50_000 }),
        DSH_SESSION_ID: "long"
    });
    const longEntry = result.json().find((s) => s.id === "long");
    assert.equal(longEntry.title, "Conversation long");
    assert.equal(longEntry.current, true);

    // A title set only at the start of a long session is still found cheaply.
    const titledEarly = conversation("early-title", 1500);
    titledEarly.splice(
        1,
        0,
        event(-1, "session/title", { title: "Early title" })
    );
    titledEarly.pop();
    writeSession("early-title", titledEarly);
    result = query(
        ["list", "--json"],
        limits({
            maxTitleSearchBytes: 100_000,
            maxDecodedBytesPerQuery: 1_000_000
        })
    );
    assert.equal(
        result.json().find((s) => s.id === "early-title").title,
        "Early title"
    );

    // Limits can only be lowered.
    result = query(
        ["events", "--session", "split", "--limit", "1000", "--json"],
        limits({ maxEvents: 1_000_000 })
    );
    assert.equal(result.json().events.length, 3);
    result = query(
        ["events", "--session", "split", "--max-chars", "999999", "--json"],
        limits({ maxChars: 1_000_000 })
    );
    assert.ok(result.json().events.every((e) => e.text.length <= 8000));

    // The session file size cap.
    result = query(
        ["events", "--session", "long"],
        limits({ maxSessionFileBytes: 1000 })
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /above the 1000-byte limit/);
} finally {
    await rm(home, { recursive: true, force: true });
}

console.log("test-session-history: ok");
