import { NextFunction, Response, Request, RequestHandler } from "express";

export default function createHttpsRedirectionMiddleware(
    enableHttpsRedirection: boolean,
    trustedDomain?: string
): RequestHandler {
    return function (req: Request, res: Response, next: NextFunction) {
        if (!enableHttpsRedirection) {
            next();
            return;
        }

        if (req.protocol && req.protocol === "http") {
            const host = trustedDomain || req.get("host");
            if (!host) {
                next();
                return;
            }
            res.set("Location", `https://${host}${req.originalUrl}`);
            res.sendStatus(301);
        } else {
            next();
        }
    };
}
