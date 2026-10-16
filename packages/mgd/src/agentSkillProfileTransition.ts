import path from "node:path";
import { open, readFile, rename, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import type { ConfigFile } from "./profile.js";
import { saveConfig } from "./profile.js";
import type { AgentSkillSourceIdentity } from "./agentSkillLocalState.js";
import { agentSkillDataRoot } from "./agentSkillLocalState.js";
import { activateAgentSkillSource } from "./agentSkillProjection.js";
import {
    ensureRealDirectory,
    withAgentSkillStateLock
} from "./agentSkillState.js";

interface ProfileTransitionJournal {
    version: 1;
    fromProfile: string;
    fromSource?: AgentSkillSourceIdentity;
    toProfile: string;
    toSource?: AgentSkillSourceIdentity;
    finalConfig: ConfigFile;
}

function journalPath(env: NodeJS.ProcessEnv): string {
    return path.join(agentSkillDataRoot(env), "profile-transition.json");
}

async function writeJournal(
    journal: ProfileTransitionJournal,
    env: NodeJS.ProcessEnv
): Promise<void> {
    const target = journalPath(env);
    await ensureRealDirectory(path.dirname(target));
    const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
    const handle = await open(temporary, "wx", 0o600);
    try {
        await handle.writeFile(JSON.stringify(journal, null, 2) + "\n", "utf8");
        await handle.sync();
    } finally {
        await handle.close();
    }
    await rename(temporary, target);
}

async function readJournal(
    env: NodeJS.ProcessEnv
): Promise<ProfileTransitionJournal | undefined> {
    try {
        const value = JSON.parse(
            await readFile(journalPath(env), "utf8")
        ) as ProfileTransitionJournal;
        if (
            value.version !== 1 ||
            typeof value.fromProfile !== "string" ||
            typeof value.toProfile !== "string" ||
            !value.finalConfig ||
            typeof value.finalConfig !== "object" ||
            !value.finalConfig.profiles ||
            typeof value.finalConfig.profiles !== "object"
        )
            throw new Error(
                "Agent Skill profile transition journal is invalid"
            );
        return value;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT")
            return undefined;
        throw error;
    }
}

export async function recoverAgentSkillProfileTransition(
    opts: { alreadyLocked?: boolean; env?: NodeJS.ProcessEnv } = {}
): Promise<boolean> {
    const env = opts.env || process.env;
    // Keep ordinary profile-backed commands lock-free when no interrupted
    // transition exists. Recheck after acquiring the lock before recovery.
    if (!opts.alreadyLocked && !(await readJournal(env))) return false;
    const run = async () => {
        const journal = await readJournal(env);
        if (!journal) return false;
        await activateAgentSkillSource(journal.toSource, journal.toProfile, {
            alreadyLocked: true,
            env,
            forceRefresh: true
        });
        await saveConfig(journal.finalConfig, env);
        await rm(journalPath(env), { force: true });
        return true;
    };
    return opts.alreadyLocked ? run() : withAgentSkillStateLock(run);
}

export async function commitAgentSkillProfileTransition(
    transition: Omit<ProfileTransitionJournal, "version">,
    opts: { alreadyLocked?: boolean; env?: NodeJS.ProcessEnv } = {}
): Promise<Awaited<ReturnType<typeof activateAgentSkillSource>>> {
    const env = opts.env || process.env;
    const run = async () => {
        await recoverAgentSkillProfileTransition({ alreadyLocked: true, env });
        const journal: ProfileTransitionJournal = {
            version: 1,
            ...transition
        };
        await writeJournal(journal, env);
        let activation: Awaited<ReturnType<typeof activateAgentSkillSource>>;
        try {
            activation = await activateAgentSkillSource(
                journal.toSource,
                journal.toProfile,
                { alreadyLocked: true, env }
            );
        } catch (error) {
            await activateAgentSkillSource(
                journal.fromSource,
                journal.fromProfile,
                { alreadyLocked: true, env, forceRefresh: true }
            );
            await rm(journalPath(env), { force: true });
            throw error;
        }
        try {
            // saveConfig's final operation is the atomic rename commit point.
            await saveConfig(journal.finalConfig, env);
        } catch (error) {
            await activateAgentSkillSource(
                journal.fromSource,
                journal.fromProfile,
                { alreadyLocked: true, env, forceRefresh: true }
            );
            await rm(journalPath(env), { force: true });
            throw error;
        }
        // Cleanup is deliberately outside the rollback catches. If it fails,
        // the committed journal remains and the next command completes forward.
        await rm(journalPath(env), { force: true });
        return activation;
    };
    return opts.alreadyLocked ? run() : withAgentSkillStateLock(run);
}
