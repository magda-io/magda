import { NextFunction, Response, Request, RequestHandler } from "express";
import * as URI from "urijs";

export default function createHttpsRedirectionMiddleware(
    enableHttpsRedirection: boolean
): RequestHandler {
    return function(req: Request, res: Response, next: NextFunction) {
        if (!enableHttpsRedirection) {
            next();
            return;
        }

        const uri = new URI(req.originalUrl);
        if (uri.pathname() === "/v0/healthz") {
            next();
            return;
        }

        const protocol = req.get("X-Forwarded-Proto");
        if (protocol && protocol === "http") {
            res.set("Location", `https://${req.get("host")}${req.originalUrl}`);
            res.sendStatus(301);
        } else {
            next();
        }
    };
}
