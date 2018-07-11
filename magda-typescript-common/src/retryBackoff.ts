import runLater from "./runLater";

export default function retryBackoff<T>(
    op: () => Promise<T>,
    delaySeconds: number,
    retries: number,
    onRetry: (e: any, retries: number) => any,
    easing: (delaySeconds: number) => number = delaySeconds => delaySeconds * 2
): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        resolve(
            op().then(
                result => result,
                e => {
                    if (retries > 0) {
                        onRetry(e, retries);
                        return runLater(delaySeconds * 1000, () =>
                            retryBackoff(
                                op,
                                easing(delaySeconds),
                                retries - 1,
                                onRetry
                            )
                        );
                    } else {
                        throw e;
                    }
                }
            )
        );
    });
}
