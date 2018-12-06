/*
 * random-stream
 * Ben Postlethwaite
 * 2013 MIT
 */
import { Readable } from "stream";

const sizeGen = randIntGenerator(100, 200);
export default class RandomStream extends Readable {
    private now: number;

    constructor(waitMilliseconds: number) {
        super({
            read: maxSize => {
                const size = Math.min(sizeGen(), maxSize);

                let array = Array(size);
                for (let i = 0; i < size; i++) {
                    array.push(randChar());
                }
                const bytes = array.join("");

                const newTime = this.getTime();
                const timeDiff = Math.max(0, newTime - this.now);

                if (timeDiff < waitMilliseconds) {
                    const timeUntilWaitOver = timeDiff - waitMilliseconds;
                    const waitTime = Math.max(
                        0,
                        randIntGenerator(
                            timeUntilWaitOver / 4,
                            (timeUntilWaitOver / 4) * 3
                        )()
                    );
                    // console.log("pushing " + bytes);
                    setTimeout(() => this.push(bytes), waitTime);
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
