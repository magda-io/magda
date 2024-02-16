import ServerError from "../ServerError.js";

export default function unionToThrowable<T>(input: T | Error | ServerError): T {
    if (input instanceof ServerError) {
        throw <ServerError>input;
    } else if (input instanceof Error) {
        throw <Error>input;
    } else {
        return <T>input;
    }
}
