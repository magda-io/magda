type EmitFn = (chunk: string) => void;

const noop = () => undefined;
export default class MarkdownChunkStream {
    private inCodeBlock = false;
    private codeBlockBuffer = "";
    private normalBuffer = "";
    private timeoutId: ReturnType<typeof setTimeout> | null = null;
    private readonly timeoutMs: number;
    private readonly emit: EmitFn;
    private decoder = new TextDecoder();

    constructor(emit: EmitFn, timeoutMs: number = 5000) {
        this.emit = emit;
        this.timeoutMs = timeoutMs;
    }

    /**
     * Write data into the stream. Accepts Uint8Array or string.
     */
    public write(data: Uint8Array | string) {
        const chunkStr =
            typeof data === "string"
                ? data
                : this.decoder.decode(data, { stream: true });
        this._processChunk(chunkStr);
    }

    /**
     * Reset all internal state, buffers, and timers.
     */
    public reset() {
        this.inCodeBlock = false;
        this.codeBlockBuffer = "";
        this.normalBuffer = "";
        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
            this.timeoutId = null;
        }
    }

    /**
     * Force flush any remaining buffer (e.g., at end of stream)
     */
    public flush(onComplete: () => void = noop) {
        if (this.inCodeBlock && this.codeBlockBuffer) {
            this.emit(this.codeBlockBuffer);
        } else if (this.normalBuffer.length) {
            this.emit(this.normalBuffer);
        }
        this.reset();
        onComplete();
    }

    private _scheduleTimeout() {
        if (this.timeoutId) return;
        this.timeoutId = setTimeout(() => {
            this.flush(); // force flush buffer
        }, this.timeoutMs);
    }

    private _flushCodeBlock() {
        this.emit(this.codeBlockBuffer);
        this.codeBlockBuffer = "";
        this.inCodeBlock = false;
        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
            this.timeoutId = null;
        }
    }

    private _processChunk(chunk: string) {
        this.normalBuffer += chunk;

        // Match ```lang (code block fence line, no newline)
        const codeBlockPattern = /^```[^\n]*$/gm;
        let match;

        while ((match = codeBlockPattern.exec(this.normalBuffer)) !== null) {
            const fence = match[0];
            const index = match.index;

            const before = this.normalBuffer.slice(0, index);
            const after = this.normalBuffer.slice(index + fence.length);

            if (!this.inCodeBlock) {
                // Outside code block, emit normal content before opening fence
                if (before.length) {
                    this.emit(before);
                }
                this.inCodeBlock = true;
                this.codeBlockBuffer = fence; // Don't add \n here
                this._scheduleTimeout();
            } else {
                // Inside code block, this is the closing fence
                this.codeBlockBuffer += before + fence + "\n";
                this._flushCodeBlock();
            }

            this.normalBuffer = after;
            codeBlockPattern.lastIndex = 0; // reset regex position
        }

        // After last match, append the remaining buffer
        if (this.inCodeBlock) {
            this.codeBlockBuffer += this.normalBuffer;
        } else if (this.normalBuffer.length) {
            this.emit(this.normalBuffer);
        }

        this.normalBuffer = "";
    }
}
