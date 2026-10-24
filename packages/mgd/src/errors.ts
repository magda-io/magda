/**
 * What is known about a failed mutating request:
 * - `not-sent`: it failed before the server could receive it;
 * - `unknown`: it may have been received and committed (timeout, connection
 *   reset, 5xx or an unreadable response), so it must not be resent blindly.
 * Absent for a confirmed rejection (4xx) and for non-mutating requests.
 */
export type MutationOutcome = "not-sent" | "unknown";

export class MgdApiError extends Error {
    constructor(
        message: string,
        readonly status: number,
        readonly code: string,
        readonly hint?: string,
        readonly outcome?: MutationOutcome,
        readonly details?: Record<string, unknown>
    ) {
        super(message);
        this.name = "MgdApiError";
    }

    /** Copy with extra details, e.g. the publication a write targeted. */
    withDetails(details: Record<string, unknown>): MgdApiError {
        return new MgdApiError(
            this.message,
            this.status,
            this.code,
            this.hint,
            this.outcome,
            { ...this.details, ...details }
        );
    }
}

export class UsageError extends Error {
    /** Optional stable machine-readable reason for JSON error output. */
    constructor(message: string, readonly code?: string) {
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
