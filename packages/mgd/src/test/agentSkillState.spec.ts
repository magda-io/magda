import { expect } from "chai";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { withAgentSkillStateLock } from "../agentSkillState.js";

describe("Agent Skill state locking", () => {
    let temporaryDirectory: string;
    let originalConfigHome: string | undefined;
    let originalDataHome: string | undefined;
    let originalProjectionRoot: string | undefined;

    beforeEach(async () => {
        temporaryDirectory = await fs.mkdtemp(
            path.join(os.tmpdir(), "mgd-agent-skill-state-")
        );
        originalConfigHome = process.env.XDG_CONFIG_HOME;
        originalDataHome = process.env.XDG_DATA_HOME;
        originalProjectionRoot = process.env.MGD_AGENT_SKILL_DIR;
        process.env.XDG_CONFIG_HOME = temporaryDirectory;
        process.env.XDG_DATA_HOME = path.join(temporaryDirectory, "data");
    });

    afterEach(async () => {
        if (originalConfigHome === undefined)
            delete process.env.XDG_CONFIG_HOME;
        else process.env.XDG_CONFIG_HOME = originalConfigHome;
        if (originalDataHome === undefined) delete process.env.XDG_DATA_HOME;
        else process.env.XDG_DATA_HOME = originalDataHome;
        if (originalProjectionRoot === undefined)
            delete process.env.MGD_AGENT_SKILL_DIR;
        else process.env.MGD_AGENT_SKILL_DIR = originalProjectionRoot;
        await fs.rm(temporaryDirectory, { recursive: true, force: true });
    });

    async function startLockHolder(env: NodeJS.ProcessEnv) {
        const moduleUrl = new URL("../agentSkillState.ts", import.meta.url)
            .href;
        const child = spawn(
            process.execPath,
            [
                "--import=tsx/esm",
                "--input-type=module",
                "-e",
                `import { withAgentSkillStateLock } from ${JSON.stringify(
                    moduleUrl
                )}; await withAgentSkillStateLock(async () => { console.log("locked"); await new Promise(() => setInterval(() => {}, 1000)); });`
            ],
            { env, stdio: ["ignore", "pipe", "inherit"] }
        );
        await new Promise<void>((resolve, reject) => {
            child.once("error", reject);
            child.stdout!.once("data", () => resolve());
        });
        return child;
    }

    it("permits same-operation reentrancy and a later operation", async () => {
        expect(
            await withAgentSkillStateLock(() =>
                withAgentSkillStateLock(async () => "nested")
            )
        ).to.equal("nested");
        expect(await withAgentSkillStateLock(async () => "released")).to.equal(
            "released"
        );
    });

    it("uses one projection lock across different config homes", async () => {
        const child = await startLockHolder({ ...process.env });
        let caught: unknown;
        const previous = process.env.XDG_CONFIG_HOME;
        process.env.XDG_CONFIG_HOME = path.join(
            temporaryDirectory,
            "other-config"
        );
        try {
            await withAgentSkillStateLock(async () => undefined);
        } catch (error) {
            caught = error;
        } finally {
            process.env.XDG_CONFIG_HOME = previous;
            child.kill("SIGKILL");
            await new Promise<void>((resolve) =>
                child.once("exit", () => resolve())
            );
        }
        expect(caught).to.be.instanceOf(Error);
        expect((caught as Error).message).to.include("already running");
    });

    it("locks a shared explicit projection across different data homes", async () => {
        process.env.MGD_AGENT_SKILL_DIR = path.join(
            temporaryDirectory,
            "shared-projection"
        );
        const child = await startLockHolder({ ...process.env });
        let caught: unknown;
        const previous = process.env.XDG_DATA_HOME;
        process.env.XDG_DATA_HOME = path.join(temporaryDirectory, "other-data");
        try {
            await withAgentSkillStateLock(async () => undefined);
        } catch (error) {
            caught = error;
        } finally {
            process.env.XDG_DATA_HOME = previous;
            child.kill("SIGKILL");
            await new Promise<void>((resolve) =>
                child.once("exit", () => resolve())
            );
        }
        expect(caught).to.be.instanceOf(Error);
        expect((caught as Error).message).to.include("already running");
    });

    it("fails closed while the lock holder event loop is blocked", async () => {
        const moduleUrl = new URL("../agentSkillState.ts", import.meta.url)
            .href;
        const child = spawn(
            process.execPath,
            [
                "--import=tsx/esm",
                "--input-type=module",
                "-e",
                `import { withAgentSkillStateLock } from ${JSON.stringify(
                    moduleUrl
                )}; await withAgentSkillStateLock(async () => { console.log("locked"); const until=Date.now()+1500; while(Date.now()<until){} await new Promise(() => setInterval(() => {}, 1000)); });`
            ],
            { env: process.env, stdio: ["ignore", "pipe", "inherit"] }
        );
        await new Promise<void>((resolve, reject) => {
            child.once("error", reject);
            child.stdout!.once("data", () => resolve());
        });
        let caught: unknown;
        try {
            await withAgentSkillStateLock(async () => "must not run");
        } catch (error) {
            caught = error;
        } finally {
            child.kill("SIGKILL");
            await new Promise<void>((resolve) =>
                child.once("exit", () => resolve())
            );
        }
        expect(caught).to.be.instanceOf(Error);
        expect((caught as Error).message).to.include("lock");
    });

    it("releases its OS-managed lock when the owner process is terminated", async () => {
        const moduleUrl = new URL("../agentSkillState.ts", import.meta.url)
            .href;
        const child = spawn(
            process.execPath,
            [
                "--import=tsx/esm",
                "--input-type=module",
                "-e",
                `import { withAgentSkillStateLock } from ${JSON.stringify(
                    moduleUrl
                )}; await withAgentSkillStateLock(async () => { console.log("locked"); await new Promise(() => setInterval(() => {}, 1000)); });`
            ],
            { env: process.env, stdio: ["ignore", "pipe", "inherit"] }
        );
        await new Promise<void>((resolve, reject) => {
            child.once("error", reject);
            child.stdout!.once("data", (chunk) => {
                if (String(chunk).includes("locked")) resolve();
                else
                    reject(new Error("child did not acquire Agent Skill lock"));
            });
        });
        child.kill("SIGKILL");
        await new Promise<void>((resolve) =>
            child.once("exit", () => resolve())
        );
        expect(
            await withAgentSkillStateLock(async () => "recovered after exit")
        ).to.equal("recovered after exit");
    });

    it("serializes simultaneous contenders", async () => {
        let release!: () => void;
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        let active = 0;
        let maximumActive = 0;
        const contender = () =>
            withAgentSkillStateLock(async () => {
                active += 1;
                maximumActive = Math.max(maximumActive, active);
                await gate;
                active -= 1;
                return "winner";
            });
        const operations = [contender(), contender()];
        const settledPromise = Promise.allSettled(operations);
        await new Promise((resolve) => setTimeout(resolve, 20));
        release();
        const settled = await settledPromise;
        expect(maximumActive).to.equal(1);
        expect(
            settled.filter((item) => item.status === "fulfilled")
        ).to.have.length(1);
        expect(
            settled.filter((item) => item.status === "rejected")
        ).to.have.length(1);
    });

    it("releases the lock when the protected operation throws", async () => {
        const expected = new Error("operation failed");
        let caught: unknown;
        try {
            await withAgentSkillStateLock(async () => {
                throw expected;
            });
        } catch (error) {
            caught = error;
        }
        expect(caught).to.equal(expected);
        expect(await withAgentSkillStateLock(async () => "recovered")).to.equal(
            "recovered"
        );
    });
});
