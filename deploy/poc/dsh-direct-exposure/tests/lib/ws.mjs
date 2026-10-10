// Minimal RFC 6455 client (text frames, ping/pong, close) with full control of
// the handshake headers, so tests can set Host, Origin and Cookie exactly as a
// browser or an attacker would. No permessage-deflate is requested.
import crypto from "node:crypto";
import net from "node:net";
import tls from "node:tls";
import { EventEmitter } from "node:events";

function encodeFrame(opcode, payload) {
    const data = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
    const mask = crypto.randomBytes(4);
    let header;
    if (data.length < 126) {
        header = Buffer.from([0x80 | opcode, 0x80 | data.length]);
    } else if (data.length < 65536) {
        header = Buffer.alloc(4);
        header[0] = 0x80 | opcode;
        header[1] = 0x80 | 126;
        header.writeUInt16BE(data.length, 2);
    } else {
        header = Buffer.alloc(10);
        header[0] = 0x80 | opcode;
        header[1] = 0x80 | 127;
        header.writeBigUInt64BE(BigInt(data.length), 2);
    }
    const masked = Buffer.alloc(data.length);
    for (let i = 0; i < data.length; i++) masked[i] = data[i] ^ mask[i % 4];
    return Buffer.concat([header, mask, masked]);
}

/**
 * Open a WebSocket.
 * @param {object} o
 * @param {string} o.connectHost  TCP host (e.g. 127.0.0.1)
 * @param {number} o.connectPort
 * @param {boolean} o.tls         use TLS (SNI = servername)
 * @param {string} o.servername
 * @param {string} o.path
 * @param {Record<string,string>} o.headers  handshake headers (Host, Origin, Cookie, ...)
 * @returns {Promise<{status:number, headers:object, body?:string, ws?:WsConnection}>}
 */
export function connect(o) {
    return new Promise((resolve, reject) => {
        const key = crypto.randomBytes(16).toString("base64");
        const socket = o.tls
            ? tls.connect({
                  host: o.connectHost,
                  port: o.connectPort,
                  servername: o.servername,
                  rejectUnauthorized: false
              })
            : net.connect(o.connectPort, o.connectHost);
        const lines = [
            `GET ${o.path} HTTP/1.1`,
            "Connection: Upgrade",
            "Upgrade: websocket",
            "Sec-WebSocket-Version: 13",
            `Sec-WebSocket-Key: ${key}`,
            ...Object.entries(o.headers || {}).map(([k, v]) => `${k}: ${v}`)
        ];
        socket.once(o.tls ? "secureConnect" : "connect", () =>
            socket.write(lines.join("\r\n") + "\r\n\r\n")
        );
        let buf = Buffer.alloc(0);
        const onData = (d) => {
            buf = Buffer.concat([buf, d]);
            const end = buf.indexOf("\r\n\r\n");
            if (end === -1) return;
            const head = buf.subarray(0, end).toString("latin1").split("\r\n");
            const status = Number(head[0].split(" ")[1]);
            const headers = {};
            for (const line of head.slice(1)) {
                const i = line.indexOf(":");
                headers[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
            }
            const rest = buf.subarray(end + 4);
            socket.off("data", onData);
            if (status !== 101) {
                let body = rest.toString();
                socket.on("data", (more) => (body += more.toString()));
                const done = () => resolve({ status, headers, body });
                socket.once("close", done);
                setTimeout(done, 1500).unref();
                return;
            }
            const expected = crypto
                .createHash("sha1")
                .update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")
                .digest("base64");
            if (headers["sec-websocket-accept"] !== expected) {
                socket.destroy();
                return reject(new Error("bad Sec-WebSocket-Accept"));
            }
            resolve({ status, headers, ws: new WsConnection(socket, rest) });
        };
        socket.on("data", onData);
        socket.once("error", reject);
        const timeoutMs = o.timeoutMs ?? 15000;
        const timer = setTimeout(() => {
            socket.destroy();
            resolve({ status: 0, headers: {}, body: `no handshake response within ${timeoutMs} ms` });
        }, timeoutMs);
        timer.unref();
        socket.once("close", () => clearTimeout(timer));
        socket.on("data", () => clearTimeout(timer));
    });
}

export class WsConnection extends EventEmitter {
    constructor(socket, initial) {
        super();
        this.socket = socket;
        this.buf = Buffer.alloc(0);
        this.fragments = [];
        this.pings = 0;
        this.textFrames = 0;
        this.closed = false;
        socket.on("data", (d) => this.#onData(d));
        socket.on("close", () => {
            this.closed = true;
            this.emit("close", this.closeCode);
        });
        socket.on("error", (e) => this.emit("error", e));
        if (initial?.length) this.#onData(initial);
    }

    #onData(d) {
        this.buf = Buffer.concat([this.buf, d]);
        for (;;) {
            if (this.buf.length < 2) return;
            const fin = (this.buf[0] & 0x80) !== 0;
            const opcode = this.buf[0] & 0x0f;
            let len = this.buf[1] & 0x7f;
            let off = 2;
            if (len === 126) {
                if (this.buf.length < 4) return;
                len = this.buf.readUInt16BE(2);
                off = 4;
            } else if (len === 127) {
                if (this.buf.length < 10) return;
                len = Number(this.buf.readBigUInt64BE(2));
                off = 10;
            }
            if (this.buf.length < off + len) return;
            const payload = this.buf.subarray(off, off + len);
            this.buf = this.buf.subarray(off + len);
            if (opcode === 0x9) {
                this.pings++;
                this.emit("ping");
                this.socket.write(encodeFrame(0xa, payload));
            } else if (opcode === 0xa) {
                this.emit("pong", payload);
            } else if (opcode === 0x8) {
                this.closeCode = payload.length >= 2 ? payload.readUInt16BE(0) : 1005;
                this.socket.end(encodeFrame(0x8, payload.subarray(0, 2)));
            } else if (opcode === 0x1 || opcode === 0x0) {
                this.fragments.push(Buffer.from(payload));
                if (fin) {
                    const text = Buffer.concat(this.fragments).toString("utf8");
                    this.fragments = [];
                    this.textFrames++;
                    let json;
                    try {
                        json = JSON.parse(text);
                    } catch {}
                    this.emit("message", json ?? text, text);
                }
            }
        }
    }

    send(value) {
        this.socket.write(encodeFrame(0x1, typeof value === "string" ? value : JSON.stringify(value)));
    }

    /** Client-initiated ping; resolves true when the matching pong arrives within timeoutMs. */
    ping(timeoutMs = 10000) {
        return new Promise((resolve) => {
            const timer = setTimeout(() => resolve(false), timeoutMs);
            this.once("pong", () => {
                clearTimeout(timer);
                resolve(true);
            });
            this.socket.write(encodeFrame(0x9, "probe"));
        });
    }

    close(code = 1000) {
        const p = Buffer.alloc(2);
        p.writeUInt16BE(code);
        this.socket.write(encodeFrame(0x8, p));
        setTimeout(() => this.socket.destroy(), 500).unref();
    }
}
