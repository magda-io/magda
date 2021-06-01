import { Router, Request, Response } from "express";
import session from "express-session";
import urijs from "urijs";
import createPool, { PoolCreationOptions } from "./createPool";
import AuthApiClient, { User, UserToken, Maybe } from "@magda/auth-api-client";
export { default as getAbsoluteUrl } from "@magda/typescript-common/dist/getAbsoluteUrl";
export { default as getSessionId } from "magda-typescript-common/dist/session/getSessionId";
import { default as destroySessionImport } from "magda-typescript-common/dist/session/destroySession";
import {
    DEFAULT_SESSION_COOKIE_NAME as DEFAULT_SESSION_COOKIE_NAME_IMPORT,
    DEFAULT_SESSION_COOKIE_OPTIONS as DEFAULT_SESSION_COOKIE_OPTIONS_IMPORT,
    CookieOptions as CookieOptionsImport,
    deleteCookie as deleteCookieImport
} from "@magda/typescript-common/dist/session/cookieUtils";
import passport from "passport";
import _ from "lodash";

export const destroySession = destroySessionImport;

export type SessionCookieOptions = CookieOptionsImport;
export type CookieOptions = CookieOptionsImport;

export type MagdaSessionRouterOptions = {
    cookieOptions: SessionCookieOptions;
    sessionSecret: string;
    sessionDBHost: string;
    sessionDBPort: number;
    sessionDBUser?: string; // if not specified, env var will be used
    sessionDBPassword?: string; // if not specified, env var will be used
    // if not specified, will used default `session`
    sessionDBName?: string;
};

export const DEFAULT_SESSION_COOKIE_NAME = DEFAULT_SESSION_COOKIE_NAME_IMPORT;
export const DEFAULT_SESSION_COOKIE_OPTIONS = DEFAULT_SESSION_COOKIE_OPTIONS_IMPORT;
export const deleteCookie = deleteCookieImport;

/**
 * Create an express router that can be used to enable session on an express application.
 *
 * @export
 * @param {MagdaSessionRouterOptions} options
 * @returns {Router}
 */
export function createMagdaSessionRouter(
    options: MagdaSessionRouterOptions
): Router {
    const router: Router = Router();
    const { sessionDBUser, sessionDBPassword, sessionDBName } = options;

    const dbConfig = {
        dbHost: options.sessionDBHost,
        dbPort: options.sessionDBPort
    } as PoolCreationOptions;

    if (sessionDBUser) {
        dbConfig.dbUser = sessionDBUser;
    }

    if (sessionDBPassword) {
        dbConfig.dbPassword = sessionDBPassword;
    }

    if (sessionDBName) {
        dbConfig.database = sessionDBName;
    }

    const dbPool = createPool(dbConfig);

    router.use(require("cookie-parser")());

    const store = new (require("connect-pg-simple")(session))({
        pool: dbPool
    });

    const sessionCookieOptions = !_.isEmpty(options.cookieOptions)
        ? {
              ...DEFAULT_SESSION_COOKIE_OPTIONS,
              ...options.cookieOptions
          }
        : {
              ...DEFAULT_SESSION_COOKIE_OPTIONS
          };

    const sessionMiddleware = session({
        store,
        // --- we don't have to set session cookie name
        // --- but good to make sure it'd be only one value in our app
        name: DEFAULT_SESSION_COOKIE_NAME,
        // --- no need to set cookie settings. Gateway will auto change the setting according to configuration.
        secret: options.sessionSecret,
        cookie: sessionCookieOptions,
        resave: false,
        saveUninitialized: false,
        rolling: true,
        proxy: true
    });

    router.use(sessionMiddleware);

    return router;
}

/**
 * Complete destroy Magda session and remove session cookie from the user agent
 *
 * @export
 * @param {Request} req
 * @param {Response} res
 * @param {SessionCookieOptions} cookieOptions
 * @return {*}  {Promise<void>}
 */
export async function destroyMagdaSession(
    req: Request,
    res: Response,
    cookieOptions: SessionCookieOptions
): Promise<void> {
    await destroySession(req);
    deleteCookie(DEFAULT_SESSION_COOKIE_NAME, cookieOptions, res);
}

/**
 * Different type of AuthenticationMethod:
 * - IDP-URI-REDIRECTION: the plugin will rediredct user agent to idp (identity provider) for authentication. e.g. Google & fackebook oauth etc.
 *   - This is the default method.
 * - PASSWORD: the plugin expect frontend do a form post that contains username & password to the plugin for authentication
 * - QR-CODE: the plugin offers a url that is used by the frontend to request auth challenge data. The data will be encoded into a QR-code image and expect the user scan the QR code with a mobile app to complete the authentication request.
 *   - Once the QR-code image is generated, the frontend is expected to start polling a pre-defined plugin url to check whether the authentication is complete or not.
 */
export type AuthenticationMethod =
    | "IDP-URI-REDIRECTION"
    | "PASSWORD"
    | "QR-CODE";

export interface AuthPluginConfig
    extends Omit<AuthPluginBasicConfig, "baseUrl"> {
    // plugin display name
    name: string;
    iconUrl: string;
    authenticationMethod: AuthenticationMethod;
    loginFormExtraInfoHeading?: string;
    loginFormExtraInfoContent?: string;
    loginFormUsernameFieldLabel?: string;
    loginFormPasswordFieldLabel?: string;
    qrCodeImgDataRequestUrl?: string; // Compulsory when authenticationMethod = "QR-CODE"
    qrCodeAuthResultPollUrl?: string; // Compulsory when authenticationMethod = "QR-CODE"
    qrCodeExtraInfoHeading?: string;
    qrCodeExtraInfoContent?: string;
}

/**
 * Basic Auth Plugin are the config info that supplied to Gateway
 * via [authPlugins](https://github.com/magda-io/magda/tree/master/deploy/helm/internal-charts/gateway) helm chart config
 */
export type AuthPluginBasicConfig = {
    // plugin key. allowed chars [a-zA-Z\-]
    key: string;
    // plugin serving base url. Getway will forward all request to it
    baseUrl: string;
};

export function redirectOnSuccess(toURL: string, req: Request, res: Response) {
    const source = urijs(toURL)
        .setSearch("result", "success")
        .removeSearch("errorMessage");
    res.redirect(source.toString());
}

export function redirectOnError(
    err: any,
    toURL: string,
    req: Request,
    res: Response
) {
    const source = urijs(toURL)
        .setSearch("result", "failure")
        .setSearch("errorMessage", err);
    res.redirect(source.toString());
}

/**
 * Verify the user using the user profile received during the authentication.
 * If a user can be located, return UserToken type data.
 * Otherwise, create a new user and return UserToken type data .
 *
 * @export
 * @param {AuthApiClient} authApi
 * @param {passport.Profile} profile
 * @param {string} source
 * @param {(
 *         authApiClient: AuthApiClient,
 *         userData: User,
 *         profile: passport.Profile
 *     ) => Promise<User>} [beforeUserCreated] an optional handler that will be called just before a user is created.
 * The user data returned by this handler will be used to create the user record. The following parameters will be provided to the handler:
 * - authApiClient: Auth API Client. You can use it to add a role to the user.
 * - userData: the user data that is converted from the user profile received using the default conversion logic.
 * - profile: the user profile received
 *
 * @param {(
 *         authApiClient: AuthApiClient,
 *         user: User,
 *         profile: passport.Profile
 *     ) => Promise<void>} [afterUserCreated] an optional call that will be called when a user has just been created.
 * The following parameters will be provided to the handler:
 * - authApiClient: Auth API Client. You can use it to add a role to the user.
 * - user: the user data of the magda user that is just created.
 * - profile: the user profile received
 *
 * @returns {Promise<UserToken>}
 */
export function createOrGetUserToken(
    authApi: AuthApiClient,
    profile: passport.Profile,
    source: string,
    beforeUserCreated?: (
        authApiClient: AuthApiClient,
        userData: User,
        profile: passport.Profile
    ) => Promise<User>,
    afterUserCreated?: (
        authApiClient: AuthApiClient,
        user: User,
        profile: passport.Profile
    ) => Promise<void>
): Promise<UserToken> {
    return authApi.lookupUser(source, profile.id).then((maybe: Maybe<User>) =>
        maybe.caseOf({
            just: (user: User) => Promise.resolve(userToUserToken(user)),
            nothing: async () => {
                const user = await authApi.createUser(
                    typeof beforeUserCreated === "function"
                        ? await beforeUserCreated(
                              authApi,
                              profileToUser(profile, source),
                              profile
                          )
                        : profileToUser(profile, source)
                );
                if (typeof afterUserCreated === "function") {
                    await afterUserCreated(authApi, user, profile);
                }
                return userToUserToken(user);
            }
        })
    );
}

function profileToUser(profile: passport.Profile, source: string): User {
    if (!profile.emails || profile.emails.length === 0) {
        throw new Error("User with no email address");
    }

    return {
        displayName: profile.displayName,
        email: profile.emails[0].value,
        photoURL:
            profile.photos && profile.photos.length > 0
                ? profile.photos[0].value
                : undefined,
        source: source,
        sourceId: profile.id,
        isAdmin: false
    };
}

function userToUserToken(user: User): UserToken {
    return {
        id: <string>user.id
    };
}
