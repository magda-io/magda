// User names and search for User Usage (#3838 API-12), made with the
// **caller's** session against the Auth API users endpoints. A caller who may
// not read users gets no names, and the usage pages show IDs only.

import { AuthApiUnavailableError } from "../access/CallerAccess.js";

export interface UserDetails {
    id: string;
    displayName?: string;
    email?: string;
}

export interface UserSearchResult {
    /** `false` when the caller may not read or search users (API-12). */
    available: boolean;
    users: UserDetails[];
    /** More users match than `maxMatches`: only the first were returned. */
    truncated: boolean;
}

/** The Auth API's largest page (`MAX_PAGE_RECORD_NUMBER`). */
const SEARCH_PAGE_SIZE = 500;
/** How many name or email matches a User Usage search reads at most. */
export const MAX_USER_SEARCH_MATCHES = 2000;

export interface UserDirectoryOptions {
    /** The Auth API base URL, e.g. `http://authorization-api/v0`. */
    authApiUrl: string;
    timeoutMs?: number;
}

function toDetails(user: any): UserDetails | undefined {
    if (typeof user?.id !== "string" || !user.id) return undefined;
    return {
        id: user.id,
        ...(typeof user.displayName === "string" && user.displayName
            ? { displayName: user.displayName }
            : {}),
        ...(typeof user.email === "string" && user.email
            ? { email: user.email }
            : {})
    };
}

export default class UserDirectory {
    private readonly base: string;

    constructor(private readonly options: UserDirectoryOptions) {
        this.base = `${options.authApiUrl.replace(/\/$/, "")}/public/users`;
    }

    /**
     * `GET /v0/auth/users` with the caller's session. The Auth API filters
     * the result by the caller's `authObject/user/read` decision: a caller
     * without it is refused or sees nobody. `null` means "refused".
     */
    private async fetchUsers(
        query: Record<string, string>,
        callerToken: string
    ): Promise<UserDetails[] | null> {
        const url = new URL(this.base);
        for (const [key, value] of Object.entries(query)) {
            url.searchParams.set(key, value);
        }
        let response: Response;
        try {
            response = await fetch(url, {
                headers: { "X-Magda-Session": callerToken },
                signal: AbortSignal.timeout(this.options.timeoutMs ?? 10_000)
            });
        } catch (error) {
            throw new AuthApiUnavailableError(
                error instanceof Error ? error.message : String(error)
            );
        }
        if (response.status >= 500) {
            throw new AuthApiUnavailableError(
                `Auth API user lookup answered HTTP ${response.status}`
            );
        }
        if (!response.ok) return null;
        const body = await response.json().catch(() => undefined);
        if (!Array.isArray(body)) return null;
        return body
            .map(toDetails)
            .filter((user): user is UserDetails => !!user);
    }

    /**
     * Names for user IDs, as far as the caller may read them. An ID the
     * caller can't read (or that doesn't exist) is left out, so the page shows
     * the ID only. Never throws: a failed lookup just means no names.
     */
    async describe(
        userIds: string[],
        callerToken: string
    ): Promise<Map<string, UserDetails>> {
        const found = new Map<string, UserDetails>();
        await Promise.all(
            [...new Set(userIds)].map(async (id) => {
                try {
                    const users = await this.fetchUsers(
                        { id, limit: "1" },
                        callerToken
                    );
                    const user = users?.find((u) => u.id === id);
                    if (user) found.set(id, user);
                } catch (error) {
                    console.warn(
                        JSON.stringify({
                            event: "llm-usage-user-name-lookup-failed",
                            error:
                                error instanceof Error
                                    ? error.message
                                    : "unknown"
                        })
                    );
                }
            })
        );
        return found;
    }

    /**
     * Search users by name or email (the Auth API `keyword`) with the
     * caller's session. Throws `AuthApiUnavailableError` when the Auth API
     * can't answer.
     */
    async search(
        keyword: string,
        callerToken: string,
        maxMatches = MAX_USER_SEARCH_MATCHES
    ): Promise<UserSearchResult> {
        // Every match the caller may read, page by page, up to `maxMatches`:
        // the caller then keeps only the matches with usage, so a cap applied
        // here first would silently miss users (the Auth API orders by name,
        // not usage).
        const users: UserDetails[] = [];
        while (users.length < maxMatches) {
            const limit = Math.min(SEARCH_PAGE_SIZE, maxMatches - users.length);
            const page = await this.fetchUsers(
                {
                    keyword,
                    offset: String(users.length),
                    limit: String(limit)
                },
                callerToken
            );
            if (page === null) {
                return { available: false, users: [], truncated: false };
            }
            users.push(...page);
            if (page.length < limit) {
                return { available: true, users, truncated: false };
            }
        }
        // a full last page: see whether anything is left
        const more = await this.fetchUsers(
            { keyword, offset: String(users.length), limit: "1" },
            callerToken
        );
        return { available: true, users, truncated: !!more?.length };
    }
}
