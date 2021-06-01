import express from "express";
import signature from "cookie-signature";
import { DEFAULT_SESSION_COOKIE_NAME } from "./cookieUtils";

export default function getSessionId(
    req: express.Request,
    secret: string = ""
): string {
    const sessionCookie = req.cookies[DEFAULT_SESSION_COOKIE_NAME] as string;
    if (!sessionCookie) {
        return null;
    } else {
        if (sessionCookie.substr(0, 2) === "s:") {
            // --- process signed cookie
            const unsignResult = signature.unsign(
                sessionCookie.slice(2),
                secret
            );
            if (unsignResult === false) {
                return null;
            }
            return unsignResult;
        } else {
            return sessionCookie;
        }
    }
}
