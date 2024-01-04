import { require } from "@magda/esm-utils";
import express from "express";
import session from "express-session";
import pg from "pg";
import passport from "passport";
import urijs from "urijs";
import {
    CookieOptions,
    deleteCookie,
    DEFAULT_SESSION_COOKIE_NAME,
    DEFAULT_SESSION_COOKIE_OPTIONS
} from "magda-typescript-common/src/session/cookieUtils.js";
import getSessionId from "magda-typescript-common/src/session/getSessionId.js";
import destroySession from "magda-typescript-common/src/session/destroySession.js";
import createAuthApiKeyMiddleware from "./createAuthApiKeyMiddleware.js";
import addTrailingSlash from "magda-typescript-common/src/addTrailingSlash.js";
import getAbsoluteUrl from "magda-typescript-common/src/getAbsoluteUrl.js";

export type SessionCookieOptions = CookieOptions;

declare module "express-session" {
    interface SessionData {
        authPlugin?: AuthPluginSessionData;
    }
}

export interface AuthenticatorOptions {
    sessionSecret: string;
    dbPool: pg.Pool;
    cookieOptions?: SessionCookieOptions;
    authApiBaseUrl: string;
    enableSessionForAPIKeyAccess?: boolean;
    externalUrl: string;
    appBasePath?: string;
}

type AuthPluginSessionData = {
    key?: string;
    logoutUrl?: string;
};

/**
 * Run a list of middlewares in order.
 * It simulates express's middleware handling.
 * i.e.: middlewares (other than the first one) will be executed if the middleware before it called next()
 *
 * @param {express.RequestHandler[]} middlewareList
 * @param {express.Request} req
 * @param {express.Response} res
 * @param {express.NextFunction} next
 */
export function runMiddlewareList(
    middlewareList: express.RequestHandler[],
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
) {
    function runNext() {
        if (!middlewareList.length) return next();
        const currentMiddleware = middlewareList.shift();
        currentMiddleware(req, res, runNext);
    }
    runNext();
}

export default class Authenticator {
    private cookieParserMiddleware: express.RequestHandler;
    private sessionMiddleware: express.RequestHandler;
    private passportMiddleware: express.RequestHandler;
    private passportSessionMiddleware: express.RequestHandler;
    private apiKeyMiddleware: express.RequestHandler;
    public sessionCookieOptions: SessionCookieOptions;
    private sessionSecret: string;
    private authApiBaseUrl: string;
    private appBaseUrl: string;
    private externalUrl: string;

    constructor(options: AuthenticatorOptions) {
        this.authApiBaseUrl = options.authApiBaseUrl;
        this.appBaseUrl = addTrailingSlash(
            options.appBasePath ? options.appBasePath : "/"
        );
        this.externalUrl = addTrailingSlash(options.externalUrl);

        if (!this.authApiBaseUrl) {
            throw new Error("Authenticator requires valid auth API base URL");
        }

        this.sessionCookieOptions = options.cookieOptions
            ? {
                  ...DEFAULT_SESSION_COOKIE_OPTIONS,
                  ...options.cookieOptions
              }
            : {
                  ...DEFAULT_SESSION_COOKIE_OPTIONS
              };

        passport.serializeUser(function (user: any, cb) {
            cb(null, user);
        });

        passport.deserializeUser(function (user: any, cb) {
            cb(null, user);
        });

        const store = new (require("connect-pg-simple")(session))({
            pool: options.dbPool
        });

        this.cookieParserMiddleware = require("cookie-parser")();

        this.sessionSecret = options.sessionSecret ? options.sessionSecret : "";

        this.sessionMiddleware = session({
            store,
            // --- we don't have to set session cookie name
            // --- but good to make sure it'd be only one value in our app
            name: DEFAULT_SESSION_COOKIE_NAME,
            secret: options.sessionSecret,
            cookie: { ...this.sessionCookieOptions },
            resave: false,
            saveUninitialized: false,
            rolling: true,
            proxy: true
        });

        this.passportMiddleware = passport.initialize();
        this.passportSessionMiddleware = passport.session();
        this.apiKeyMiddleware = createAuthApiKeyMiddleware(
            this.authApiBaseUrl,
            options.enableSessionForAPIKeyAccess
        );
        this.validateAndRefreshSession = this.validateAndRefreshSession.bind(
            this
        );
        this.sessionManagementMiddleware = this.sessionManagementMiddleware.bind(
            this
        );
        this.authenticatorMiddleware = this.authenticatorMiddleware.bind(this);
    }

    /**
     * Delete cookie from web browser
     *
     * @param {express.Response} res
     * @memberof Authenticator
     */
    deleteCookie(res: express.Response) {
        deleteCookie(
            DEFAULT_SESSION_COOKIE_NAME,
            this.sessionCookieOptions,
            res
        );
    }

    /**
     * A middleware that:
     * - Validate the session and destroy the invalid one (so the future request won't carry cookies)
     * - If it's valid session, handle over to `this.passportMiddleware` and `this.passportSessionMiddleware` to build up full session env (i.e. pull session data and set them probably to req.user)
     *
     * @private
     * @param {express.Request} req
     * @param {express.Response} res
     * @param {express.NextFunction} next
     * @returns
     * @memberof Authenticator
     */
    private validateAndRefreshSession(
        req: express.Request,
        res: express.Response,
        next: express.NextFunction
    ) {
        if (req.user) {
            // --- api key authentication successful
            // --- no need to recover the session
            return next();
        } else if (!req.cookies[DEFAULT_SESSION_COOKIE_NAME]) {
            // --- session not started yet & no incoming session id cookie
            // --- proceed to other non auth middlewares
            return next();
        } else {
            // --- run the session middleware only first
            return runMiddlewareList([this.sessionMiddleware], req, res, () => {
                // --- check if the original incoming session id was invalid
                // --- here, we test session middleware's processing result
                // --- rather than accessing session store directly by ourself
                const sessionId = getSessionId(req, this.sessionSecret);
                if (req?.session?.id !== sessionId) {
                    // --- a new session has been created
                    // --- the original incoming session id must have been an invalid or expired one
                    // --- we need to destroy this newly created empty session
                    // --- destroy session here & no need to wait till `destroySession` complete
                    destroySession(req).catch((err) => {
                        // --- only log here if failed to delete session data from session store
                        console.log(`Failed to destory session: ${err}`);
                    });
                    this.deleteCookie(res);
                    // --- proceed to other middleware & no need to run passport
                    return next();
                } else {
                    // --- if the session id is valid, run passport middleware
                    return runMiddlewareList(
                        [
                            this.passportMiddleware,
                            this.passportSessionMiddleware
                        ],
                        req,
                        res,
                        next
                    );
                }
            });
        }
    }

    /**
     * A middleware to handle all logout requests that are sent to Gateway.
     * This middleware should implement the behaviour that is described in [this doc](https://github.com/magda-io/magda/blob/master/docs/docs/authentication-plugin-spec.md#get-logout-endpoint-optional)
     * in order to support auth plugin logout process.
     * When the `redirect` query parameter does not present, this middleware should be compatible with the behaviour prior to version 0.0.60.
     * i.e.:
     * - Turn off Magda session only without forwarding any requests to auth plugins
     * - Response a JSON response (that indicates the outcome of the logout action) instead of redirect users.
     * e.g. `{"isError": false}` indicates no error.
     *
     * @private
     * @param {express.Request} req
     * @param {express.Response} res
     * @param {express.NextFunction} next
     * @memberof Authenticator
     */
    private async logout(req: express.Request, res: express.Response) {
        const redirectUrl: string | null = req?.query?.["redirect"]
            ? (req.query["redirect"] as string)
            : null;

        if (!req.cookies[DEFAULT_SESSION_COOKIE_NAME]) {
            // session not started yet
            if (redirectUrl) {
                res.redirect(getAbsoluteUrl(redirectUrl, this.externalUrl));
            } else {
                // existing behaviour prior to version 0.0.60
                res.status(200).send({
                    isError: false
                });
            }
            return;
        }

        const logoutWithSession = async () => {
            const authPlugin = (req?.user?.authPlugin
                ? req.user.authPlugin
                : req?.session?.authPlugin) as
                | AuthPluginSessionData
                | undefined;

            const logoutUrl = authPlugin?.logoutUrl;

            if (redirectUrl && logoutUrl) {
                // if it's possible (e.g. logoutUri available and request come in with `redirect` parameter) for an auth plugin to handle the logout,
                // leave it to the auth plugin.
                // the Auth plugin should terminate the Magda session probably and forward to any third-party idP
                res.redirect(
                    getAbsoluteUrl(authPlugin?.logoutUrl, this.externalUrl, {
                        redirect: redirectUrl
                    })
                );
                return;
            }

            // --- based on PR review feedback, we want to report any errors happened during session destroy
            // --- and only remove cookie from user agent when session data is destroyed successfully
            try {
                await destroySession(req);
                // --- delete the cookie and continue middleware processing chain
                this.deleteCookie(res);
                if (redirectUrl) {
                    // when `redirect` query parameter exists, redirect user rather than response outcome in JSON.
                    res.redirect(getAbsoluteUrl(redirectUrl, this.externalUrl));
                } else {
                    // existing behaviour prior to version 0.0.60
                    res.status(200).send({
                        isError: false
                    });
                }
            } catch (err) {
                const errorMessage = `Failed to destory session: ${err}`;
                console.error(errorMessage);

                if (redirectUrl) {
                    // when `redirect` query parameter exists, redirect user rather than response outcome in JSON.
                    res.redirect(
                        getAbsoluteUrl(redirectUrl, this.externalUrl, {
                            errorMessage
                        })
                    );
                } else {
                    // existing behaviour prior to version 0.0.60
                    res.status(500).send({
                        isError: true,
                        errorCode: 500,
                        errorMessage
                    });
                    return;
                }
            }
        };

        runMiddlewareList(
            [this.passportMiddleware, this.passportSessionMiddleware],
            req,
            res,
            logoutWithSession
        );
    }

    /**
     * A middleware wraps all other cookie / session / passport related middlewares
     * to achieve fine-gain session / cookie control in Magda.
     * Generally, we want to:
     * - user request won't carry a cookie in the header unless they are logged in
     * - system won't mis/re-issue a new session for the same user whose request carries the session cookie
     * See https://github.com/magda-io/magda/issues/2545 for more details
     *
     * @private
     * @param {express.Request} req
     * @param {express.Response} res
     * @param {express.NextFunction} next
     * @memberof Authenticator
     */
    private sessionManagementMiddleware(
        req: express.Request,
        res: express.Response,
        next: express.NextFunction
    ) {
        const uri = new urijs(req.originalUrl);
        const pathname = uri.pathname().toLowerCase();

        if (pathname.indexOf(`${this.appBaseUrl}auth/login/`) === 0) {
            // --- start session / passport here
            return runMiddlewareList(
                [
                    this.sessionMiddleware,
                    this.passportMiddleware,
                    this.passportSessionMiddleware
                ],
                req,
                res,
                next
            );
        } else if (
            pathname === `${this.appBaseUrl}auth/logout` ||
            (pathname === `${this.appBaseUrl}sign-in-redirect` &&
                uri.hasQuery("result", "failure"))
        ) {
            // --- end the session here
            if (!req.cookies[DEFAULT_SESSION_COOKIE_NAME]) {
                // --- session not started yet
                if (pathname === `${this.appBaseUrl}auth/logout`) {
                    // even no session we should still respond to logout requests
                    return this.logout(req, res);
                } else {
                    return next();
                }
            }
            // --- Only make session / store available
            // --- passport midddleware should not be run
            return runMiddlewareList(
                [this.sessionMiddleware],
                req,
                res,
                async () => {
                    // --- destroy session here
                    // --- any session data will be removed from session store
                    if (pathname === `${this.appBaseUrl}auth/logout`) {
                        return this.logout(req, res);
                    } else {
                        // --- for non logout path, no need to wait till `destroySession` complete
                        destroySession(req).catch((err) => {
                            // --- only log here if failed to delete session data from session store
                            console.log(`Failed to destroy session: ${err}`);
                        });
                        this.deleteCookie(res);
                        return next();
                    }
                }
            );
        } else {
            // For other routes:
            // - if valid API key headers exist, attempt to login via API key
            // - otherwise, only make session & passport data available if session has already started (cookie set)
            return runMiddlewareList(
                [this.apiKeyMiddleware, this.validateAndRefreshSession],
                req,
                res,
                next
            );
        }
    }

    /**
     * A middleware warps all required authenticator middleware.
     * Only this middleware should be used externally
     *
     * @param {express.Request} req
     * @param {express.Response} res
     * @param {express.NextFunction} next
     * @memberof Authenticator
     */
    authenticatorMiddleware(
        req: express.Request,
        res: express.Response,
        next: express.NextFunction
    ) {
        return runMiddlewareList(
            [this.cookieParserMiddleware, this.sessionManagementMiddleware],
            req,
            res,
            next
        );
    }

    /**
     * Apply authenticatorMiddleware to the specified route
     *
     * @param {express.Router} router
     * @memberof Authenticator
     */
    applyToRoute(router: express.Router) {
        // --- apply our wrapper as the delegate for other middlewares
        router.use(this.authenticatorMiddleware);
    }
}
