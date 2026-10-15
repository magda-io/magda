import os from "node:os";
import path from "node:path";
import {
    link,
    lstat,
    mkdir,
    open,
    readFile,
    readdir,
    rename,
    unlink
} from "node:fs/promises";
import { randomUUID } from "node:crypto";
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

interface AgentSkillLockOwner {
    pid: number;
    hostname: string;
    token: string;
    claimOrder: string;
    createdAt: string;
}

async function readLockOwner(
    lock: string
): Promise<AgentSkillLockOwner | undefined> {
    try {
        const owner = JSON.parse(await readFile(lock, "utf8")) as Partial<
            AgentSkillLockOwner
        >;
        if (
            !Number.isSafeInteger(owner.pid) ||
            (owner.pid as number) <= 0 ||
            typeof owner.hostname !== "string" ||
            typeof owner.token !== "string" ||
            !owner.token
        ) {
            return undefined;
        }
        return owner as AgentSkillLockOwner;
    } catch {
        return undefined;
    }
}

async function lockOwnerIsLive(lock: string): Promise<boolean> {
    const owner = await readLockOwner(lock);
    if (!owner || owner.hostname !== os.hostname()) return false;
    try {
        process.kill(owner.pid, 0);
        return true;
    } catch (error) {
        return (error as NodeJS.ErrnoException).code === "EPERM";
    }
}

async function sameFile(left: string, right: string): Promise<boolean> {
    try {
        const [leftStat, rightStat] = await Promise.all([
            lstat(left, { bigint: true }),
            lstat(right, { bigint: true })
        ]);
        return leftStat.dev === rightStat.dev && leftStat.ino === rightStat.ino;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
        throw error;
    }
}

export async function withAgentSkillStateLock<T>(
    fn: () => Promise<T>
): Promise<T> {
    const target = agentSkillStatePath();
    const lock = `${target}.lock`;
    const owner: AgentSkillLockOwner = {
        pid: process.pid,
        hostname: os.hostname(),
        token: randomUUID(),
        claimOrder: `${Date.now()
            .toString()
            .padStart(16, "0")}-${process.pid
            .toString()
            .padStart(12, "0")}-${randomUUID()}`,
        createdAt: new Date().toISOString()
    };
    const candidate = `${lock}.${owner.token}.candidate`;
    await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    const handle = await open(candidate, "wx", 0o600);
    try {
        await handle.writeFile(JSON.stringify(owner));
        await handle.sync();
    } finally {
        await handle.close();
    }

    const claimsPrefix = `${path.basename(lock)}.acquire-`;
    const claim = path.join(
        path.dirname(lock),
        `${claimsPrefix}${owner.claimOrder}`
    );
    let acquired = false;
    try {
        // Publish a fully-written recovery claim atomically. All contenders can
        // inspect the directory, but only the lexicographically oldest claim
        // may touch the main lock pathname. Crashed claims are removable because
        // they carry the same owner liveness metadata as the main lock.
        await link(candidate, claim);
        const claims = (await readdir(path.dirname(lock)))
            .filter((name) => name.startsWith(claimsPrefix))
            .sort();
        for (const name of claims) {
            const contender = path.join(path.dirname(lock), name);
            if (contender === claim) continue;
            if (!(await lockOwnerIsLive(contender))) {
                await unlink(contender).catch(() => undefined);
            }
        }
        const survivingClaims = (await readdir(path.dirname(lock)))
            .filter((name) => name.startsWith(claimsPrefix))
            .sort();
        if (survivingClaims[0] !== path.basename(claim)) {
            throw new Error(
                "Another mgd agent-skill operation is already running"
            );
        }

        try {
            await link(candidate, lock);
            acquired = true;
        } catch (error) {
            if (
                (error as NodeJS.ErrnoException).code !== "EEXIST" ||
                (await lockOwnerIsLive(lock))
            ) {
                throw new Error(
                    "Another mgd agent-skill operation is already running"
                );
            }
            if (!(await sameFile(claim, candidate))) {
                throw new Error("Agent Skill lock recovery claim changed");
            }
            // No other live/recovering process may touch the lock while this
            // oldest claim remains visible.
            await unlink(lock);
            await link(candidate, lock);
            acquired = true;
        }
    } finally {
        await unlink(claim).catch(() => undefined);
        await unlink(candidate).catch(() => undefined);
    }
    if (!acquired) {
        throw new Error("Another mgd agent-skill operation is already running");
    }

    try {
        return await fn();
    } finally {
        const current = await readLockOwner(lock);
        if (current?.token === owner.token) {
            await unlink(lock).catch(() => undefined);
        }
    }
}
