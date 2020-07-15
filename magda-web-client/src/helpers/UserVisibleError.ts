import GenericError from "./GenericError";

export default class UserVisibleError extends GenericError {
    constructor(message: string = "Unknown Error", statusCode: number = 500) {
        super(message, statusCode);
    }
}
