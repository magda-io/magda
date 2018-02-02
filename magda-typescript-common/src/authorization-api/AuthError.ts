export default class AuthError extends Error {
    public statusCode: number;

    constructor(message: string = "Not authorized", statusCode: number = 401) {
        super(message);
        this.statusCode = statusCode;
    }
}
