/*
 * random-stream
 * Ben Postlethwaite
 * 2013 MIT
 */
import { Readable } from "stream";

export default class RandomStream extends Readable {
    private data: string = null;
    private now: number;

    constructor(waitMilliseconds: number, dataSize: number = 10) {
        super({
            read: size => {
                if (this.data === null) {
                    // --- signals end of stream here
                    const newTime = this.getTime();
                    const timeDiff = newTime - this.now;
                    if (timeDiff >= waitMilliseconds) {
                        this.push(null);
                    } else {
                        setTimeout(() => {
                            this.push(null);
                        }, waitMilliseconds - timeDiff);
                    }
                } else if (size >= this.data.length) {
                    this.push(this.data);
                    this.data = null;
                } else {
                    this.push(this.data.substr(0, size));
                    this.data = this.data.substring(size);
                }
            }
        });
        this.now = this.getTime();
        this.data = new Array(dataSize > 0 ? dataSize : 1)
            .fill(0)
            .map(randChar)
            .join("");
    }

    getTime() {
        return new Date().getTime();
    }
}

const randAscii = randIntGenerator(33, 126);

function randChar() {
    return String.fromCharCode(randAscii());
}

function randIntGenerator(min: number, max: number) {
    if (!min) min = 50;
    if (!max) max = 250;

    return function() {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    };
}
