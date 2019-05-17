import GenericError from "./GenericError";
export default class AccessControlError extends GenericError {
    constructor(message: string = "Access Denied", statusCode: number = 401) {
        super(message, statusCode);
    }
}
