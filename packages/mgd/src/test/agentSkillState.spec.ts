import { expect } from "chai";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
    agentSkillStatePath,
    withAgentSkillStateLock
} from "../agentSkillState.js";

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

    it("recovers a lock left by a terminated process", async () => {
        const lock = `${agentSkillStatePath()}.lock`;
        await fs.mkdir(path.dirname(lock), { recursive: true });
        await fs.writeFile(
            lock,
            JSON.stringify({
                pid: 2147483647,
                hostname: os.hostname(),
                token: "stale-owner",
                claimOrder: "stale"
            })
        );
        expect(
            await withAgentSkillStateLock(async () => "recovered stale lock")
        ).to.equal("recovered stale lock");
    });

    it("recovers a stale acquisition claim left by a terminated process", async () => {
        const lock = `${agentSkillStatePath()}.lock`;
        await fs.mkdir(path.dirname(lock), { recursive: true });
        await fs.writeFile(
            `${lock}.acquire-0000000000000000-stale`,
            JSON.stringify({
                pid: 2147483647,
                hostname: os.hostname(),
                token: "stale-claim",
                claimOrder: "0000000000000000-stale"
            })
        );
        expect(
            await withAgentSkillStateLock(async () => "recovered stale claim")
        ).to.equal("recovered stale claim");
    });

    it("serializes simultaneous stale-lock recovery contenders", async () => {
        const lock = `${agentSkillStatePath()}.lock`;
        await fs.mkdir(path.dirname(lock), { recursive: true });
        await fs.writeFile(
            lock,
            JSON.stringify({
                pid: 2147483647,
                hostname: os.hostname(),
                token: "stale-owner",
                claimOrder: "stale"
            })
        );
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

        let lockExists = true;
        try {
            await fs.stat(`${agentSkillStatePath()}.lock`);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT")
                lockExists = false;
            else throw error;
        }
        expect(lockExists).to.equal(false);
    });
});
