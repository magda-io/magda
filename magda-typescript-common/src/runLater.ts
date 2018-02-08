export default function runLater<TResult>(
    milliseconds: number = 0,
    functionToRunLater: () => Promise<TResult> | TResult
): Promise<TResult> {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            try {
                resolve(functionToRunLater());
            } catch (e) {
                reject(e);
            }
        }, milliseconds);
    });
}
