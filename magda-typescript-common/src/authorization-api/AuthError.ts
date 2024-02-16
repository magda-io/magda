import GenericError from "./GenericError.js";
export default class AuthError extends GenericError {
    constructor(message: string = "Not authorized", statusCode: number = 401) {
        super(message, statusCode);
    }
}
