export default function formatServiceError(
    baseMessage: string,
    e: any,
    retriesLeft: number
): string {
    let messageParts = [baseMessage];
    if (retriesLeft) {
        messageParts.push(`${retriesLeft} retries left.`);
    }
    if ((e?.response?.statusCode || e?.response?.status) && e.body) {
        const statusCode = e?.response?.status || e?.response?.statusCode;
        messageParts.push(
            `Status code: ${statusCode}, body:\n${JSON.stringify(
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
