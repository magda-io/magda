/**
 * Wait for `waitMilliSeconds` before resolve the promise
 */
export default function wait(waitMilliSeconds: number): Promise<void> {
    console.info(`Waiting ${waitMilliSeconds} ms`);
    if (!waitMilliSeconds) {
        return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            resolve();
        }, waitMilliSeconds);
    });
}
