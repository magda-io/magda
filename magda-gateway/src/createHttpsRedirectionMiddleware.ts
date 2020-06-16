import { NextFunction, Response, Request, RequestHandler } from "express";

export default function createHttpsRedirectionMiddleware(
    enableHttpsRedirection: boolean
): RequestHandler {
    return function (req: Request, res: Response, next: NextFunction) {
        if (!enableHttpsRedirection) {
            next();
            return;
        }

        if (req.protocol && req.protocol === "http") {
            res.set("Location", `https://${req.get("host")}${req.originalUrl}`);
            res.sendStatus(301);
        } else {
            next();
        }
    };
}
