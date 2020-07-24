export default function translateError(err: Error) {
    switch (err?.message) {
        case "Failed to fetch":
            return new Error(
                "Network error, failed to fetch remote resource from network."
            );
        default:
            return err;
    }
}
