import runLater from './runLater';

export default function retryBackoff<T>(op: () => Promise<T>, maxDelay: number, retries: number, onRetry: (e: any, retries: number) => any): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        resolve(op().then(result => result, e => {
            if (retries > 0) {
                onRetry(e, retries);
                const delay = Math.random() * maxDelay;
                return runLater(delay * 1000, () => retryBackoff(op, maxDelay * 2, retries - 1, onRetry));
            } else {
                throw e;
            }
        }));
    });
}
