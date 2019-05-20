/**
 * Wraps around the result of a call to the ES API and logs the actual error reason if present.
 *
 * @param promise A promise that might return an ES error.
 */
export default async function handleEsError<R>(
    promise: Promise<R>
): Promise<R> {
    try {
        return await promise;
    } catch (e) {
        if (e.meta && e.meta.body && e.meta.body.error) {
            console.error(e.meta.body.error);
        }
        throw e;
    }
}
