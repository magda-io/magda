import { expect } from "chai";
import {
    DshSessionStatusFrameParser,
    ForegroundActivityTracker,
    runningSessionIds
} from "../webSocketActivity.js";

function textFrame(value: unknown, final = true, opcode = 0x1): Buffer {
    const payload = Buffer.from(JSON.stringify(value));
    const header =
        payload.length < 126
            ? Buffer.from([(final ? 0x80 : 0) | opcode, payload.length])
            : Buffer.from([
                  (final ? 0x80 : 0) | opcode,
                  126,
                  payload.length >> 8,
                  payload.length & 0xff
              ]);
    return Buffer.concat([header, payload]);
}

function statusFrame(agentId: string, running: boolean) {
    return textFrame({
        type: "item",
        streamId: "events",
        value: {
            type: "emit",
            event: "api-session/status",
            args: [agentId, running]
        }
    });
}

describe("DSH foreground activity", () => {
    it("observes running status across split TCP chunks and ignores ping frames", () => {
        const statuses: Array<{ agentId: string; running: boolean }> = [];
        const parser = new DshSessionStatusFrameParser((status) =>
            statuses.push(status)
        );
        const frame = statusFrame("agent-1", true);

        parser.push(Buffer.from([0x89, 0]));
        parser.push(frame.subarray(0, 3));
        parser.push(frame.subarray(3));

        expect(statuses).to.deep.equal([{ agentId: "agent-1", running: true }]);
    });

    it("does not treat ordinary remote stream data as a foreground turn", () => {
        const statuses: unknown[] = [];
        const parser = new DshSessionStatusFrameParser((status) =>
            statuses.push(status)
        );

        parser.push(
            textFrame({
                type: "item",
                streamId: "events",
                value: { type: "ready" }
            })
        );

        expect(statuses).to.deep.equal([]);
    });

    it("extracts an authoritative running baseline from session/list", () => {
        expect(
            runningSessionIds({
                kind: "value",
                value: [
                    { sessionId: "idle", running: false },
                    { sessionId: "active", running: true }
                ]
            })
        ).to.deep.equal(["active"]);
    });

    it("retains activity across duplicate sockets and reconnect baseline", async () => {
        const renewals: Date[] = [];
        const firstSocket = Symbol("first");
        const secondSocket = Symbol("second");
        const tracker = new ForegroundActivityTracker(
            async (_userId, at) => {
                renewals.push(at);
            },
            60 * 60 * 1000,
            () => new Date("2026-10-10T12:00:00.000Z"),
            1
        );

        tracker.connect("user-1", firstSocket);
        tracker.connect("user-1", secondSocket);
        tracker.status("user-1", "agent-1", true, firstSocket);
        tracker.status("user-1", "agent-1", true, secondSocket);
        tracker.disconnect("user-1", firstSocket);
        await new Promise((resolve) => setTimeout(resolve, 5));
        const beforeSecondSocketRenewal = renewals.length;
        tracker.renewActive("user-1");
        await Promise.resolve();
        expect(renewals).to.have.length(beforeSecondSocketRenewal + 1);

        tracker.disconnect("user-1", secondSocket);
        const reconnectedSocket = Symbol("reconnected");
        tracker.connect("user-1", reconnectedSocket);
        tracker.replaceSnapshot("user-1", ["agent-1"]);
        await new Promise((resolve) => setTimeout(resolve, 5));
        const beforeReconnectRenewal = renewals.length;
        tracker.renewActive("user-1");
        await Promise.resolve();
        expect(renewals).to.have.length(beforeReconnectRenewal + 1);

        tracker.replaceSnapshot("user-1", []);
        const afterSettlement = renewals.length;
        tracker.renewActive("user-1");
        await Promise.resolve();
        expect(renewals).to.have.length(afterSettlement);
        tracker.close();
    });

    it("expires a running snapshot after the last socket disconnects", async () => {
        const renewals: Date[] = [];
        const socket = Symbol("socket");
        const tracker = new ForegroundActivityTracker(
            async (_userId, at) => {
                renewals.push(at);
            },
            60 * 60 * 1000,
            () => new Date("2026-10-10T12:00:00.000Z"),
            1
        );
        tracker.connect("user-1", socket);
        tracker.replaceSnapshot("user-1", ["agent-1"]);
        tracker.disconnect("user-1", socket);
        await new Promise((resolve) => setTimeout(resolve, 5));
        const afterDisconnect = renewals.length;
        tracker.renewActive("user-1");
        await Promise.resolve();
        expect(renewals).to.have.length(afterDisconnect);
        tracker.close();
    });

    it("fires bounded periodic renewal while a turn remains running", async () => {
        let renewals = 0;
        const tracker = new ForegroundActivityTracker(async () => {
            renewals += 1;
        }, 10);
        tracker.status("user-1", "agent-1", true);
        await new Promise((resolve) => setTimeout(resolve, 35));
        tracker.status("user-1", "agent-1", false);
        tracker.close();
        expect(renewals).to.be.greaterThan(1);
    });

    it("renews a foreground turn across the suspension threshold", async () => {
        let now = new Date("2026-10-10T12:00:00.000Z");
        const renewals: Date[] = [];
        const tracker = new ForegroundActivityTracker(
            async (_userId, at) => {
                renewals.push(at);
            },
            60 * 60 * 1000,
            () => now
        );

        tracker.status("user-1", "agent-1", true);
        await Promise.resolve();
        now = new Date("2026-10-10T12:31:00.000Z");
        tracker.renewActive("user-1");
        await Promise.resolve();
        tracker.status("user-1", "agent-1", false);
        await Promise.resolve();
        tracker.close();

        expect(renewals.map((at) => at.toISOString())).to.deep.equal([
            "2026-10-10T12:00:00.000Z",
            "2026-10-10T12:31:00.000Z",
            "2026-10-10T12:31:00.000Z"
        ]);
    });
});
