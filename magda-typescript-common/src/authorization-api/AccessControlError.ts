import GenericError from "./GenericError.js";
export default class AccessControlError extends GenericError {
    constructor(message: string = "Access Denied", statusCode: number = 401) {
        super(message, statusCode);
    }
}
