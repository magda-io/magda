import { Writable } from "stream";

export default class DevNull extends Writable {
    _write(
        chunk: any,
        encoding: string,
        callback: (err?: Error) => void
    ): void {
        callback();
    }
}
