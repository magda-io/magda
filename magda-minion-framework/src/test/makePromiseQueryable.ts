export interface QueryablePromise<W> extends Promise<W> {
    isResolved: () => boolean;
    isRejected: () => boolean;
    isFulfilled: () => boolean;
    isQueryable: boolean;
}

export default function makePromiseQueryable<W>(
    promise: Promise<W> | QueryablePromise<W>
): QueryablePromise<W> {
    // Don't create a wrapper for promises that can already be queried.
    const castPromise = promise as QueryablePromise<W>;
    if (castPromise.isQueryable) {
        return castPromise;
    }

    var isResolved = false;
    var isRejected = false;

    // Observe the promise, saving the fulfillment in a closure scope.
    var result: any = promise.then(
        function (v) {
            isResolved = true;
            return v;
        },
        function (e) {
            isRejected = true;
            throw e;
        }
    );
    result.isQueryable = true;
    result.isFulfilled = function () {
        return isResolved || isRejected;
    };
    result.isResolved = function () {
        return isResolved;
    };
    result.isRejected = function () {
        return isRejected;
    };
    return result;
}
