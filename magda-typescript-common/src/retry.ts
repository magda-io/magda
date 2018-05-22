import runLater from "./runLater";

export default function retry<T>(
    op: () => Promise<T>,
    delaySeconds: number,
    retries: number,
    onRetry: (e: any, retries: number) => any,
    shouldRetry: (e: any) => boolean = () => true
): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        resolve(
            op().then(
                result => result,
                e => {
                    if (retries > 0 && shouldRetry(e)) {
                        onRetry(e, retries);
                        return runLater(delaySeconds * 1000, () =>
                            retry(op, delaySeconds, retries - 1, onRetry)
                        );
                    } else {
                        throw e;
                    }
                }
            )
        );
    });
}
