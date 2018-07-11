export default function formatServiceError(
    baseMessage: string,
    e: any,
    retriesLeft: number
): string {
    let messageParts = [baseMessage];
    if (retriesLeft) {
        messageParts.push(`${retriesLeft} retries left.`);
    }
    if (e && e.response && e.response.statusCode && e.body) {
        messageParts.push(
            `Status code: ${e.response.statusCode}, body:\n${JSON.stringify(
                e.body,
                null,
                "  "
            )}`
        );
    } else if (e && e instanceof Error) {
        messageParts.push(`Exception:\n${e.toString()}`);
    } else if (e && e.toString() !== {}.toString()) {
        messageParts.push(`Details:\n${e.toString()}`);
    } else if (e) {
        messageParts.push(`Details:\n${JSON.stringify(e, null, "  ")}`);
    }

    return messageParts.join(" ");
}
