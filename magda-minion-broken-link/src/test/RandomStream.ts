/*
 * random-stream
 * Ben Postlethwaite
 * 2013 MIT
 */
import { Readable } from "stream";

// const sizeGen = randIntGenerator(1000, 2000);
export default class RandomStream extends Readable {
    private now: number;

    constructor(waitMilliseconds: number) {
        super({
            read: () => {
                const newTime = this.getTime();
                const timeDiff = Math.max(0, newTime - this.now);

                if (timeDiff <= waitMilliseconds) {
                    setTimeout(() => this.push(randChar()));
                } else {
                    this.push(null);
                }
            }
        });
        this.now = this.getTime();
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
