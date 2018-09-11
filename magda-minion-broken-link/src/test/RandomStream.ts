/*
 * random-stream
 * Ben Postlethwaite
 * 2013 MIT
 */
import { Readable } from "stream";

export default function RandomStream(options: any) {
    options = options || {};
    var stream = new Readable();

    var randInt = randIntGenerator(options.min, options.max);

    stream._read = function(n) {
        var self = this;
        setTimeout(function() {
            self.push(randChar());
        }, randInt());
    };

    return stream;
}

var randAscii = randIntGenerator(33, 126);

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
