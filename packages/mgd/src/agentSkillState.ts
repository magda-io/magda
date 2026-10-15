import os from "node:os";
import path from "node:path";
import { lstat, mkdir, open, readFile, rename } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { AgentSkillRef, AgentSkillType } from "./agentSkillTypes.js";

export interface ManagedAgentSkillEntry {
    ref: AgentSkillRef;
    name: string;
    dir: string;
    remoteChecksum: string;
    installedTreeDigest: string;
    updatedAt: string;
}

export interface AgentSkillDraftState {
    type: AgentSkillType;
    name: string;
    ref?: AgentSkillRef;
    baseChecksum?: string;
    treeDigest: string;
}

export interface AgentSkillStateV1 {
    version: 1;
    managedRoot: string;
    entries: Record<string, ManagedAgentSkillEntry>;
    drafts: Record<string, AgentSkillDraftState>;
}

export const stateKey = (ref: AgentSkillRef) => `${ref.type}/${ref.id}`;

export function agentSkillStatePath(): string {
    const configHome =
        process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
    return path.join(configHome, "mgd", "agent-skills-v1.json");
}

export function managedAgentSkillRoot(): string {
    return path.resolve(
        process.env.MGD_AGENT_SKILL_DIR ||
            (process.env.DSH_HOME
                ? path.join(process.env.DSH_HOME, "skills")
                : path.join(os.homedir(), ".agents", "skills"))
    );
}

export async function ensureRealDirectory(
    directory: string,
    mode = 0o700
): Promise<void> {
    const resolved = path.resolve(directory);
    try {
        const before = await lstat(resolved);
        if (before.isSymbolicLink() || !before.isDirectory()) {
            throw new Error(
                `Agent Skill directory must be a real directory: ${resolved}`
            );
        }
        return;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    await mkdir(resolved, { recursive: true, mode });
    const created = await lstat(resolved);
    if (created.isSymbolicLink() || !created.isDirectory()) {
        throw new Error(
            `Agent Skill directory must be a real directory: ${resolved}`
        );
    }
}

export function managedChildPath(root: string, name: string): string {
    const resolvedRoot = path.resolve(root);
    const child = path.resolve(resolvedRoot, name);
    if (path.dirname(child) !== resolvedRoot) {
        throw new Error("Agent Skill managed path escaped its root");
    }
    return child;
}

function emptyState(): AgentSkillStateV1 {
    return {
        version: 1,
        managedRoot: managedAgentSkillRoot(),
        entries: {},
        drafts: {}
    };
}

export async function loadAgentSkillState(): Promise<AgentSkillStateV1> {
    const file = agentSkillStatePath();
    let parsed: unknown;
    try {
        parsed = JSON.parse(await readFile(file, "utf8"));
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT")
            return emptyState();
        throw new Error(
            `Could not read Agent Skill state: ${(error as Error).message}`
        );
    }
    if (
        !parsed ||
        typeof parsed !== "object" ||
        (parsed as any).version !== 1 ||
        typeof (parsed as any).managedRoot !== "string" ||
        !(parsed as any).entries ||
        typeof (parsed as any).entries !== "object" ||
        !(parsed as any).drafts ||
        typeof (parsed as any).drafts !== "object"
    ) {
        throw new Error(
            "Agent Skill state has an unsupported or invalid format"
        );
    }
    const state = parsed as AgentSkillStateV1;
    // A caller may deliberately move the managed projection through the
    // environment; do not apply old state to the new root.
    if (path.resolve(state.managedRoot) !== managedAgentSkillRoot()) {
        return emptyState();
    }
    return state;
}

export async function saveAgentSkillState(
    state: AgentSkillStateV1
): Promise<void> {
    const target = agentSkillStatePath();
    await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
    const handle = await open(temporary, "wx", 0o600);
    try {
        await handle.writeFile(JSON.stringify(state, null, 2) + "\n", "utf8");
        await handle.sync();
    } finally {
        await handle.close();
    }
    await rename(temporary, target);
}

export function agentSkillStateLockPort(): number {
    const digest = createHash("sha256").update(agentSkillStatePath()).digest();
    // Use the dynamic/private range and derive a stable per-state-path port.
    return 49152 + (digest.readUInt16BE(0) % 16384);
}

export async function withAgentSkillStateLock<T>(
    fn: () => Promise<T>
): Promise<T> {
    const server = createServer();
    server.unref();
    try {
        await new Promise<void>((resolve, reject) => {
            const fail = (error: NodeJS.ErrnoException) => {
                server.removeListener("listening", ready);
                if (error.code === "EADDRINUSE") {
                    reject(
                        new Error(
                            "Another mgd agent-skill operation is already running"
                        )
                    );
                } else {
                    reject(error);
                }
            };
            const ready = () => {
                server.removeListener("error", fail);
                resolve();
            };
            server.once("error", fail);
            server.once("listening", ready);
            server.listen({
                host: "127.0.0.1",
                port: agentSkillStateLockPort(),
                exclusive: true
            });
        });
        return await fn();
    } finally {
        if (server.listening) {
            await new Promise<void>((resolve, reject) =>
                server.close((error) => (error ? reject(error) : resolve()))
            );
        }
    }
}
