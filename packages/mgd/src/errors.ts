export class MgdApiError extends Error {
    constructor(
        message: string,
        readonly status: number,
        readonly code: string,
        readonly hint?: string
    ) {
        super(message);
        this.name = "MgdApiError";
    }
}

export class UsageError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "UsageError";
    }
}

export function exitCodeFor(e: unknown): number {
    if (e instanceof UsageError) return 2;
    if (e instanceof MgdApiError) {
        if (e.status === 401 || e.status === 403) return 3;
        if (e.status === 404) return 4;
    }
    return 1;
}
