import unknown2Error from "./unknown2Error.js";

export abstract class TryResult<T = any> {
    public readonly value: T;
    public readonly error: Error;
    abstract isSuccessful: boolean;
    constructor(v?: T, e?: Error) {
        this.value = v;
        this.error = e;
    }

    get(): T {
        if (this.isSuccessful) {
            return this.value;
        } else {
            throw new Error("Cannot retrieve value from a Failure");
        }
    }
    getOr(v: T) {
        if (this.isSuccessful) {
            return this.value;
        } else {
            return v;
        }
    }
}

export class Success<T = any> extends TryResult<T> {
    public readonly isSuccessful = true;
    constructor(v: T) {
        super(v);
    }
}

export class Failure<T = any> extends TryResult<T> {
    public readonly isSuccessful = false;

    constructor(e: Error) {
        super(undefined, e);
    }
}

export default async function Try<T>(
    func: (() => T) | Promise<T> | (() => Promise<T>)
): Promise<TryResult<T>> {
    try {
        if (typeof func === "function") {
            const r = await func();
            return new Success(r);
        } else {
            const r = await func;
            return new Success(r);
        }
    } catch (e) {
        return new Failure(unknown2Error(e));
    }
}
