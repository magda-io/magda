/**
 * Check if error is a network-level failure (e.g. "Failed to fetch", CORS, DNS, etc.)
 */
export default function isNetworkError(err: unknown): boolean {
    if (!err) return false;

    // Fetch API: browsers throw TypeError for network/CORS issues
    if (err instanceof TypeError) {
        const msg = (err.message || "").toLowerCase();
        if (
            msg.includes("fetch") ||
            msg.includes("load failed") || // Safari
            msg.includes("networkerror")
        ) {
            return true;
        }
        return true; // fallback: any TypeError from fetch
    }

    // Axios: "Network Error"
    if (
        typeof err === "object" &&
        err !== null &&
        "message" in err &&
        typeof (err as any).message === "string" &&
        (err as any).message.toLowerCase() === "network error"
    ) {
        return true;
    }

    // Node.js fetch (undici): system error codes
    if (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        typeof (err as any).code === "string"
    ) {
        const code = (err as any).code as string;
        if (
            [
                "ECONNREFUSED",
                "ENOTFOUND",
                "EAI_AGAIN",
                "ECONNRESET",
                "ETIMEDOUT"
            ].includes(code)
        ) {
            return true;
        }
    }

    return false;
}
