import { Writable } from "stream";

const noop = () => {};

export default class DevNull extends Writable {
    private onComplete: () => void;

    private isComplete: boolean = false;

    constructor(onComplete: () => void = noop) {
        super({
            decodeStrings: false,
            write: (chunk, encoding, callback) => {
                // --- drop data
                callback();
            },
            final: callback => {
                try {
                    this.isComplete = true;
                    if (
                        this.onComplete &&
                        typeof this.onComplete === "function"
                    ) {
                        this.onComplete();
                    }
                } catch (e) {
                    console.log(e);
                }
                callback();
            }
        });
        this.onComplete = onComplete;
    }

    setOnComplete(callback: () => void) {
        this.onComplete = callback;
        if (this.isComplete) {
            callback();
        }
    }
}
