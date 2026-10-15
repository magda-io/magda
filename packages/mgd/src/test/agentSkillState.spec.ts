import { expect } from "chai";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { withAgentSkillStateLock } from "../agentSkillState.js";

describe("Agent Skill state locking", () => {
    let temporaryDirectory: string;
    let originalConfigHome: string | undefined;

    beforeEach(async () => {
        temporaryDirectory = await fs.mkdtemp(
            path.join(os.tmpdir(), "mgd-agent-skill-state-")
        );
        originalConfigHome = process.env.XDG_CONFIG_HOME;
        process.env.XDG_CONFIG_HOME = temporaryDirectory;
    });

    afterEach(async () => {
        if (originalConfigHome === undefined)
            delete process.env.XDG_CONFIG_HOME;
        else process.env.XDG_CONFIG_HOME = originalConfigHome;
        await fs.rm(temporaryDirectory, { recursive: true, force: true });
    });

    it("rejects a concurrent operation and permits a later operation", async () => {
        let concurrentError: unknown;
        await withAgentSkillStateLock(async () => {
            try {
                await withAgentSkillStateLock(async () => undefined);
            } catch (error) {
                concurrentError = error;
            }
            expect(concurrentError).to.be.instanceOf(Error);
            expect((concurrentError as Error).message).to.include(
                "already running"
            );
        });

        expect(await withAgentSkillStateLock(async () => "released")).to.equal(
            "released"
        );
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
                )}; await withAgentSkillStateLock(async () => { console.log("locked"); await new Promise(() => {}); });`
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
