class ServerError extends Error {
    public statusCode: number = 500;

    constructor(message: string, statusCode: number = 500) {
        super(message);
        this.statusCode = statusCode;
    }
}

export default ServerError;
