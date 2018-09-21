export default class GenericError extends Error {
    public statusCode: number;

    constructor(message: string = "Unknown Error", statusCode: number = 500) {
        super(message);
        this.statusCode = statusCode;
    }

    toData() {
        return {
            isError: true,
            errorCode: this.statusCode,
            errorMessage: this.message
        };
    }
}
