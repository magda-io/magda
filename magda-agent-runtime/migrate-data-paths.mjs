#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { zstdCompressSync, zstdDecompressSync } from "node:zlib";

const dataRoot = process.env.MAGDA_AGENT_DATA_ROOT || "/data";
const legacyHome = path.join(dataRoot, "dsh-home");
const agentHome = path.join(dataRoot, "agent-home");
const workspaceRoot = path.join(dataRoot, "workspace");
const legacyHarness = path.join(workspaceRoot, "deepseek-harness");
const agentHarness = path.join(workspaceRoot, "agent-harness");
const legacyWorkspacePath = `${legacyHarness}${path.sep}`;
const agentWorkspacePath = `${agentHarness}${path.sep}`;
const migrationMarker = path.join(dataRoot, ".agent-paths-v1");
const textExtensions = new Set([".json", ".jsonl", ".txt", ".yaml", ".yml"]);

function exists(file) {
    try {
        fs.lstatSync(file);
        return true;
    } catch (error) {
        if (error?.code === "ENOENT") return false;
        throw error;
    }
}

function moveDirectory(from, to, label) {
    if (!exists(from)) return false;
    if (exists(to)) {
        throw new Error(
            `Cannot migrate ${label}: both ${from} and ${to} already exist`
        );
    }
    const source = fs.lstatSync(from);
    if (!source.isDirectory() || source.isSymbolicLink()) {
        throw new Error(`Cannot migrate ${label}: ${from} is not a directory`);
    }
    fs.renameSync(from, to);
    console.log(`magda-agent: migrated ${from} to ${to}`);
    return true;
}

function atomicRewrite(file, content, mode) {
    const temporary = `${file}.migration`;
    fs.writeFileSync(temporary, content, { mode });
    fs.renameSync(temporary, file);
    fs.chmodSync(file, mode);
}

function readFirstZstdFrame(file) {
    const size = fs.statSync(file).size;
    if (size === 0)
        throw new Error(`Empty compressed DSH session log: ${file}`);
    const descriptor = fs.openSync(file, "r");
    try {
        let prefixLength = Math.min(size, 64 * 1024);
        for (;;) {
            const prefix = Buffer.allocUnsafe(prefixLength);
            const bytesRead = fs.readSync(
                descriptor,
                prefix,
                0,
                prefixLength,
                0
            );
            try {
                const result = zstdDecompressSync(
                    prefix.subarray(0, bytesRead),
                    {
                        info: true
                    }
                );
                const compressedBytes = result.engine.bytesWritten;
                if (
                    !Number.isSafeInteger(compressedBytes) ||
                    compressedBytes <= 0 ||
                    compressedBytes > bytesRead
                ) {
                    throw new Error(
                        `Invalid first Zstandard frame length in ${file}: ${compressedBytes}`
                    );
                }
                return { content: result.buffer, compressedBytes };
            } catch (error) {
                if (error?.code !== "Z_BUF_ERROR" || prefixLength === size) {
                    throw error;
                }
                prefixLength = Math.min(size, prefixLength * 2);
            }
        }
    } finally {
        fs.closeSync(descriptor);
    }
}

function writeAll(descriptor, buffer, length = buffer.length) {
    let offset = 0;
    while (offset < length) {
        const written = fs.writeSync(
            descriptor,
            buffer,
            offset,
            length - offset
        );
        if (written === 0)
            throw new Error("Could not complete migration write");
        offset += written;
    }
}

function rewriteCompressedSessionHeader(file, mode) {
    const { content, compressedBytes } = readFirstZstdFrame(file);
    const header = content.toString("utf8");
    if (!header.includes(legacyWorkspacePath)) return;

    const temporary = `${file}.migration`;
    let source;
    let destination;
    try {
        source = fs.openSync(file, "r");
        destination = fs.openSync(temporary, "w", mode);
        writeAll(
            destination,
            zstdCompressSync(
                Buffer.from(
                    header.replaceAll(legacyWorkspacePath, agentWorkspacePath)
                )
            )
        );
        const buffer = Buffer.allocUnsafe(64 * 1024);
        let position = compressedBytes;
        for (;;) {
            const bytesRead = fs.readSync(
                source,
                buffer,
                0,
                buffer.length,
                position
            );
            if (bytesRead === 0) break;
            writeAll(destination, buffer, bytesRead);
            position += bytesRead;
        }
        fs.fsyncSync(destination);
        fs.closeSync(source);
        source = undefined;
        fs.closeSync(destination);
        destination = undefined;
        fs.renameSync(temporary, file);
        fs.chmodSync(file, mode);
    } catch (error) {
        if (source !== undefined) fs.closeSync(source);
        if (destination !== undefined) fs.closeSync(destination);
        fs.rmSync(temporary, { force: true });
        throw error;
    }
}

async function migrateStateTree(directory) {
    if (!exists(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            await migrateStateTree(file);
        } else if (entry.isFile()) {
            const mode = fs.statSync(file).mode & 0o777;
            if (entry.name.endsWith(".zstd")) {
                rewriteCompressedSessionHeader(file, mode);
            } else if (textExtensions.has(path.extname(entry.name))) {
                const source = fs.readFileSync(file, "utf8");
                if (source.includes(legacyWorkspacePath)) {
                    atomicRewrite(
                        file,
                        source.replaceAll(
                            legacyWorkspacePath,
                            agentWorkspacePath
                        ),
                        mode
                    );
                }
            }
        }

        const migratedName = entry.name.replaceAll(
            "deepseek-harness",
            "agent-harness"
        );
        if (migratedName !== entry.name) {
            const destination = path.join(directory, migratedName);
            if (exists(destination)) {
                throw new Error(
                    `Cannot migrate DSH state path: both ${file} and ${destination} exist`
                );
            }
            fs.renameSync(file, destination);
        }
    }
}

fs.mkdirSync(dataRoot, { recursive: true });
fs.mkdirSync(workspaceRoot, { recursive: true });
if (exists(migrationMarker)) {
    if (exists(legacyHome) || exists(legacyHarness)) {
        throw new Error(
            `Legacy Agent Workspace path exists after ${migrationMarker} was committed`
        );
    }
} else {
    moveDirectory(legacyHome, agentHome, "DSH home");

    let legacyWorkspaceSymlink = false;
    if (exists(legacyHarness) && fs.lstatSync(legacyHarness).isSymbolicLink()) {
        if (
            !exists(agentHarness) ||
            fs.realpathSync(legacyHarness) !== fs.realpathSync(agentHarness)
        ) {
            throw new Error(
                `Cannot use ${legacyHarness}: expected a symlink to ${agentHarness}`
            );
        }
        legacyWorkspaceSymlink = true;
    } else {
        moveDirectory(legacyHarness, agentHarness, "workspace directory");
    }

    // DSH stores the absolute working directory in its registry, projection
    // cache, compressed session headers, and the human-readable project
    // directory name. Rewrite all four before DSH starts so upgraded sessions
    // remain grouped and writable without retaining a legacy alias.
    await migrateStateTree(agentHome);
    if (legacyWorkspaceSymlink) fs.rmSync(legacyHarness);
    atomicRewrite(migrationMarker, "1\n", 0o600);
}
