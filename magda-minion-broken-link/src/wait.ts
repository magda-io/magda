/**
 * Wait for `waitMilliSeconds` before resolve the promise
 */
export default function wait(waitMilliSeconds: number) {
    if (!waitMilliSeconds) {
        return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
        setTimeout(() => resolve(), waitMilliSeconds);
    });
}
