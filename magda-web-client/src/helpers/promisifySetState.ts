export type ReactStateUpdaterType<T> = (
    state: ((prevState: Readonly<T>) => T) | T,
    callback?: () => void
) => void;

const promisifySetState = <T>(reactStateUpdater: ReactStateUpdaterType<T>) => (
    state: ((prevState: Readonly<T>) => T) | T
) =>
    new Promise<void>((resolve, reject) => {
        if (typeof state === "function") {
            reactStateUpdater((prevState) => {
                try {
                    return (state as any)(prevState);
                } catch (e) {
                    reject(e);
                }
            }, resolve);
        } else {
            reactStateUpdater(state, resolve);
        }
    });

export default promisifySetState;
