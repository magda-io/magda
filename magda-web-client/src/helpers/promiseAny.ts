/**
 * Implementation of the proposed `promise.any` (https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/any).
 * Take an array of promises and return a new promise that will be resolved
 * when any of promises is resolved and will be rejected when all promised are rejected.
 * This function tries to replicate the functionality of the coming promise API Promise.any:
 * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/any
 *
 * @export
 * @param {Promise<T>[]} items
 * @returns {Promise<T>}
 */
export default function promiseAny<T = any>(items: Promise<T>[]): Promise<T> {
    return new Promise((resolve, reject) => {
        const result: {
            isCompleted: boolean;
            error?: any;
        }[] = items.map(item => ({
            isCompleted: false
        }));

        let isResultReturned = false;

        items.forEach((item, idx) => {
            item.then(r => {
                if (isResultReturned) {
                    return;
                }
                isResultReturned = true;
                resolve(r);
            }).catch(e => {
                if (isResultReturned) {
                    return;
                }
                result[idx].isCompleted = true;
                result[idx].error = e;
                if (!result.some(item => !item.isCompleted)) {
                    isResultReturned = true;
                    reject(result.map(item => item.error).filter(item => item));
                }
            });
        });
    });
}
