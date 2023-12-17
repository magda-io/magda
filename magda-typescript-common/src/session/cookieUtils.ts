import express, { CookieOptions as CookieOptionsType } from "express";

export type CookieOptions = CookieOptionsType;

export const DEFAULT_SESSION_COOKIE_NAME: string = "connect.sid";

export let DEFAULT_SESSION_COOKIE_OPTIONS: CookieOptions = {
    maxAge: 7 * 60 * 60 * 1000,
    sameSite: "lax",
    httpOnly: true,
    secure: false
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
    res.clearCookie(cookieName, cookieOptions);
}
