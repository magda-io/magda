interface SessionStatusEvent {
    agentId: string;
    running: boolean;
}

type ActivityOwner = string | symbol;

/**
 * Parses unmasked Host-to-browser WebSocket text frames and reports DSH's
 * `api-session/status` forwarded events. Ping/pong control frames are ignored.
 */
export class DshSessionStatusFrameParser {
    private buffered = Buffer.alloc(0);
    private fragmentedText: Buffer[] | undefined;
    private observing = true;

    constructor(
        private readonly onStatus: (event: SessionStatusEvent) => void
    ) {}

    push(chunk: Buffer) {
        if (!this.observing) return;
        // Status frames are tiny. Stop observing a malformed/oversized stream
        // rather than letting the proxy's side-channel parser retain unbounded
        // data; forwarding of the WebSocket itself continues unchanged.
        if (this.buffered.length + chunk.length > 1024 * 1024) {
            this.buffered = Buffer.alloc(0);
            this.fragmentedText = undefined;
            this.observing = false;
            return;
        }
        this.buffered = Buffer.concat([this.buffered, chunk]);
        while (this.parseFrame()) {
            // Drain all complete frames in this TCP chunk.
        }
    }

    private parseFrame(): boolean {
        if (this.buffered.length < 2) return false;
        const first = this.buffered[0];
        const second = this.buffered[1];
        const final = (first & 0x80) !== 0;
        const opcode = first & 0x0f;
        const masked = (second & 0x80) !== 0;
        let payloadLength = second & 0x7f;
        let offset = 2;

        if (payloadLength === 126) {
            if (this.buffered.length < 4) return false;
            payloadLength = this.buffered.readUInt16BE(2);
            offset = 4;
        } else if (payloadLength === 127) {
            if (this.buffered.length < 10) return false;
            const length = this.buffered.readBigUInt64BE(2);
            if (length > BigInt(Number.MAX_SAFE_INTEGER)) {
                this.buffered = Buffer.alloc(0);
                this.observing = false;
                return false;
            }
            payloadLength = Number(length);
            offset = 10;
        }

        const maskLength = masked ? 4 : 0;
        const frameLength = offset + maskLength + payloadLength;
        if (this.buffered.length < frameLength) return false;

        const mask = masked
            ? this.buffered.subarray(offset, offset + 4)
            : undefined;
        offset += maskLength;
        const payload = Buffer.from(
            this.buffered.subarray(offset, offset + payloadLength)
        );
        this.buffered = this.buffered.subarray(frameLength);
        if (mask) {
            for (let index = 0; index < payload.length; index += 1) {
                payload[index] ^= mask[index % 4];
            }
        }

        if (opcode === 0x1) {
            this.fragmentedText = final ? undefined : [payload];
            if (final) this.inspectText(payload);
        } else if (opcode === 0x0 && this.fragmentedText) {
            this.fragmentedText.push(payload);
            if (final) {
                this.inspectText(Buffer.concat(this.fragmentedText));
                this.fragmentedText = undefined;
            }
        }
        return true;
    }

    private inspectText(payload: Buffer) {
        try {
            const frame = JSON.parse(payload.toString("utf8")) as {
                type?: unknown;
                value?: {
                    type?: unknown;
                    event?: unknown;
                    args?: unknown;
                };
            };
            const event = frame.value;
            if (
                frame.type !== "item" ||
                event?.type !== "emit" ||
                event.event !== "api-session/status" ||
                !Array.isArray(event.args) ||
                typeof event.args[0] !== "string" ||
                typeof event.args[1] !== "boolean"
            ) {
                return;
            }
            this.onStatus({
                agentId: event.args[0],
                running: event.args[1]
            });
        } catch {
            // DSH validates its own protocol. The proxy only observes known frames.
        }
    }
}

/** Keeps active foreground turns renewed without counting idle WebSocket pings. */
export class ForegroundActivityTracker {
    private readonly agents = new Map<
        string,
        Map<string, Set<ActivityOwner>>
    >();
    private readonly timers = new Map<string, ReturnType<typeof setInterval>>();
    private readonly connections = new Map<string, Set<ActivityOwner>>();
    private readonly disconnectTimers = new Map<
        ActivityOwner,
        ReturnType<typeof setTimeout>
    >();

    constructor(
        private readonly renew: (userId: string, at: Date) => Promise<void>,
        private readonly intervalMs: number,
        private readonly now: () => Date = () => new Date(),
        private readonly disconnectGraceMs = Math.max(intervalMs * 2, 30_000)
    ) {}

    connect(userId: string, owner: ActivityOwner) {
        const owners = this.connections.get(userId) || new Set<ActivityOwner>();
        owners.add(owner);
        this.connections.set(userId, owners);
    }

    status(
        userId: string,
        agentId: string,
        running: boolean,
        owner: ActivityOwner = "event"
    ) {
        if (!running) {
            // A settled status is authoritative and broadcast to every client.
            this.removeAgent(userId, agentId);
            void this.persist(userId);
            return;
        }

        const agents = this.agents.get(userId) || new Map();
        const owners = agents.get(agentId) || new Set<ActivityOwner>();
        owners.add(owner);
        agents.set(agentId, owners);
        this.agents.set(userId, agents);
        void this.persist(userId);
        this.ensureTimer(userId);
    }

    replaceSnapshot(
        userId: string,
        runningAgentIds: Iterable<string>,
        owner: ActivityOwner = "session-list"
    ) {
        const running = new Set(runningAgentIds);
        const agents = this.agents.get(userId) || new Map();
        for (const [agentId, owners] of agents) {
            if (running.has(agentId)) owners.add(owner);
            else agents.delete(agentId);
        }
        for (const agentId of running) {
            const owners = agents.get(agentId) || new Set<ActivityOwner>();
            owners.add(owner);
            agents.set(agentId, owners);
        }
        if (agents.size) {
            this.agents.set(userId, agents);
            void this.persist(userId);
            this.ensureTimer(userId);
        } else {
            this.agents.delete(userId);
            this.stopTimer(userId);
        }
    }

    renewActive(userId: string) {
        if (!this.agents.get(userId)?.size) return;
        void this.persist(userId);
    }

    disconnect(userId: string, owner: ActivityOwner) {
        if (this.disconnectTimers.has(owner)) return;
        const timer = setTimeout(() => {
            this.disconnectTimers.delete(owner);
            const connections = this.connections.get(userId);
            connections?.delete(owner);
            if (connections && !connections.size)
                this.connections.delete(userId);

            const agents = this.agents.get(userId);
            if (!agents) return;
            const hasConnection = Boolean(this.connections.get(userId)?.size);
            for (const [agentId, owners] of agents) {
                owners.delete(owner);
                // A session/list baseline is trustworthy only while at least
                // one browser transport remains connected.
                if (!hasConnection) owners.delete("session-list");
                if (!owners.size) agents.delete(agentId);
            }
            if (!agents.size) {
                this.agents.delete(userId);
                this.stopTimer(userId);
            }
        }, this.disconnectGraceMs);
        timer.unref?.();
        this.disconnectTimers.set(owner, timer);
    }

    close() {
        for (const userId of this.timers.keys()) this.stopTimer(userId);
        for (const timer of this.disconnectTimers.values()) clearTimeout(timer);
        this.disconnectTimers.clear();
        this.connections.clear();
        this.agents.clear();
    }

    private removeAgent(userId: string, agentId: string) {
        const agents = this.agents.get(userId);
        if (!agents) return;
        agents.delete(agentId);
        if (!agents.size) {
            this.agents.delete(userId);
            this.stopTimer(userId);
        }
    }

    private ensureTimer(userId: string) {
        if (this.timers.has(userId)) return;
        const timer = setInterval(
            () => this.renewActive(userId),
            this.intervalMs
        );
        timer.unref?.();
        this.timers.set(userId, timer);
    }

    private persist(userId: string) {
        return this.renew(userId, this.now()).catch((error) =>
            console.error("Could not persist foreground activity", error)
        );
    }

    private stopTimer(userId: string) {
        const timer = this.timers.get(userId);
        if (timer) clearInterval(timer);
        this.timers.delete(userId);
    }
}

/** Extract authoritative running session IDs from a DSH Remote RPC response. */
export function runningSessionIds(value: unknown): string[] {
    const found = new Set<string>();
    const visit = (candidate: unknown) => {
        if (Array.isArray(candidate)) {
            candidate.forEach(visit);
            return;
        }
        if (!candidate || typeof candidate !== "object") return;
        const record = candidate as Record<string, unknown>;
        if (typeof record.sessionId === "string" && record.running === true) {
            found.add(record.sessionId);
        }
        Object.values(record).forEach(visit);
    };
    visit(value);
    return [...found];
}
