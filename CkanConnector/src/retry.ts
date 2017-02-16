import runLater from './runLater';

export default function retry<T>(op: () => PromiseLike<T>, delaySeconds: number, retries: number, onRetry: (e: any, retries: number) => any): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        resolve(op().then(result => result, e => {
            if (retries > 0) {
                onRetry(e, retries);
                return runLater(delaySeconds * 1000, () => retry(op, delaySeconds, retries - 1, onRetry));
            } else {
                throw e;
            }
        }));
    });
}