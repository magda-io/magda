export default function unionToThrowable<T>(input: T | Error): T {
    if (input instanceof Error) {
        throw <Error>input;
    } else {
        return <T>input;
    }
}
