import os from "node:os";
import path from "node:path";
import { lstat, mkdir, open, readFile, rename } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { resolveAgentSkillProjectionTargets } from "./skills.js";
import type { Server } from "node:net";
import { createConnection, createServer } from "node:net";
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

function managedPathAnchor(target: string): string {
    const candidates = [process.env.HOME, os.tmpdir()]
        .filter((value): value is string => !!value)
        .map((value) => path.resolve(value))
        .filter(
            (value) =>
                target === value || target.startsWith(`${value}${path.sep}`)
        )
        .sort((a, b) => b.length - a.length);
    return candidates[0] || path.parse(target).root;
}

export async function assertRealManagedAncestors(
    target: string
): Promise<void> {
    const resolved = path.resolve(target);
    const anchor = managedPathAnchor(resolved);
    const relative = path.relative(anchor, resolved);
    const components = relative ? relative.split(path.sep) : [];
    let current = anchor;
    for (const component of ["", ...components]) {
        if (component) current = path.join(current, component);
        try {
            const found = await lstat(current);
            if (found.isSymbolicLink() || !found.isDirectory()) {
                throw new Error(
                    `Agent Skill path must have only real directory ancestors: ${current}`
                );
            }
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
            throw error;
        }
    }
}

export async function ensureRealDirectory(
    directory: string,
    mode = 0o700
): Promise<void> {
    const resolved = path.resolve(directory);
    const anchor = managedPathAnchor(resolved);
    await mkdir(anchor, { recursive: true, mode });
    await assertRealManagedAncestors(anchor);
    const relative = path.relative(anchor, resolved);
    let current = anchor;
    for (const component of relative ? relative.split(path.sep) : []) {
        current = path.join(current, component);
        try {
            const found = await lstat(current);
            if (found.isSymbolicLink() || !found.isDirectory())
                throw new Error(
                    `Agent Skill directory must be a real directory: ${current}`
                );
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
            await mkdir(current, { mode });
            const created = await lstat(current);
            if (created.isSymbolicLink() || !created.isDirectory())
                throw new Error(
                    `Agent Skill directory must be a real directory: ${current}`
                );
        }
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

function agentSkillProjectionStateIdentity(): string {
    const dataHome =
        process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share");
    return path.resolve(dataHome, "mgd", "agent-skills", "projection.json");
}

function lockDigest(identity: string): Buffer {
    return createHash("sha256").update(identity).digest();
}

function agentSkillLockIdentities(): string[] {
    return [
        `state:${agentSkillProjectionStateIdentity()}`,
        ...resolveAgentSkillProjectionTargets({ env: process.env }).map(
            ({ root }) => `root:${path.resolve(root)}`
        )
    ]
        .filter((value, index, values) => values.indexOf(value) === index)
        .sort();
}

export function agentSkillStateLockPort(): number {
    const digest = lockDigest(`state:${agentSkillProjectionStateIdentity()}`);
    return 49152 + (digest.readUInt16BE(0) % 16384);
}

async function existingLockStatus(
    port: number,
    identity: string
): Promise<"same" | "different" | "unknown"> {
    return new Promise((resolve) => {
        const socket = createConnection({ host: "127.0.0.1", port });
        let response = "";
        let finished = false;
        const finish = (status: "same" | "different" | "unknown") => {
            if (finished) return;
            finished = true;
            socket.destroy();
            resolve(status);
        };
        socket.setEncoding("utf8");
        // A non-responsive listener might be this exact lock holder paused in
        // CPU work or GC. Ambiguity must fail closed, never select another port.
        socket.setTimeout(200, () => finish("unknown"));
        socket.on("data", (chunk) => {
            response += chunk;
            if (response.length >= identity.length)
                finish(
                    response.slice(0, identity.length) === identity
                        ? "same"
                        : "different"
                );
        });
        socket.on("error", () => finish("unknown"));
        socket.on("end", () =>
            finish(response === identity ? "same" : "different")
        );
    });
}

async function acquireAgentSkillStateLock(
    lockIdentity: string
): Promise<Server> {
    const digest = lockDigest(lockIdentity);
    const identity = digest.toString("hex");
    for (let offset = 0; offset < 16; offset += 2) {
        const port = 49152 + (digest.readUInt16BE(offset) % 16384);
        const server = createServer((socket) => socket.end(identity));
        server.unref();
        try {
            await new Promise<void>((resolve, reject) => {
                server.once("error", reject);
                server.once("listening", resolve);
                server.listen({ host: "127.0.0.1", port, exclusive: true });
            });
            return server;
        } catch (error) {
            server.close();
            if ((error as NodeJS.ErrnoException).code !== "EADDRINUSE")
                throw error;
            const status = await existingLockStatus(port, identity);
            if (status !== "different") {
                throw new Error(
                    status === "same"
                        ? "Another mgd agent-skill operation is already running"
                        : "Agent Skill operation lock is occupied and could not be verified; retry later"
                );
            }
        }
    }
    throw new Error("Could not allocate the Agent Skill operation lock");
}

const agentSkillLockContext = new AsyncLocalStorage<boolean>();

export async function withAgentSkillStateLock<T>(
    fn: () => Promise<T>
): Promise<T> {
    if (agentSkillLockContext.getStore()) return fn();
    const servers: Server[] = [];
    try {
        for (const identity of agentSkillLockIdentities())
            servers.push(await acquireAgentSkillStateLock(identity));
        return await agentSkillLockContext.run(true, fn);
    } finally {
        for (const server of servers.reverse()) {
            await new Promise<void>((resolve, reject) =>
                server.close((error) => (error ? reject(error) : resolve()))
            );
        }
    }
}
