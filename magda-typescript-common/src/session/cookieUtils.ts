import express from "express";

/** This is present in the express-session types but not actually exported properly, so it needs to be copy-pasted here */
export type CookieOptions = {
    maxAge?: number;
    signed?: boolean;
    expires?: Date;
    httpOnly?: boolean;
    path?: string;
    domain?: string;
    secure?: boolean | "auto";
    encode?: (val: string) => string;
    sameSite?: boolean | "lax" | "strict" | "none";
};

export const DEFAULT_SESSION_COOKIE_NAME: string = "connect.sid";

export let DEFAULT_SESSION_COOKIE_OPTIONS: CookieOptions = {
    maxAge: 7 * 60 * 60 * 1000,
    sameSite: "lax",
    httpOnly: true,
    secure: "auto"
};

export function deleteCookie(
    cookieName: string,
    cookieOptions: CookieOptions,
    res: express.Response
) {
    const deleteCookieOptions = {
        ...cookieOptions
    };
    // --- `clearCookie` works in a way like it will fail to delete cookie if maxAge presents T_T
    // --- https://github.com/expressjs/express/issues/3856#issuecomment-502397226
    delete deleteCookieOptions.maxAge;
    res.clearCookie(cookieName, deleteCookieOptions);
}
