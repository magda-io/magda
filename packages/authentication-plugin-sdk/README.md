### MAGDA Authentication Plugin SDK

Please information please refer to the [Authentication Plugin Spec](https://github.com/magda-io/magda/blob/master/docs/docs/authentication-plugin-spec.md)

Existing Magda Authentication Plugins can be found from [here](https://github.com/magda-io?q=magda-auth).

You can use [this repo](https://github.com/magda-io/magda-auth-template) as [a template](https://docs.github.com/en/free-pro-team@latest/github/creating-cloning-and-archiving-repositories/creating-a-repository-from-a-template) to create your own magda authentication plugin.

```typescript
/**
 * Create an express router that can be used to enable session on an express application.
 *
 * @export
 * @param {MagdaSessionRouterOptions} options
 * @returns {Router}
 */
export declare function createMagdaSessionRouter(
    options: MagdaSessionRouterOptions
): Router;

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
 * The user data returned by this handler will be used to create a user record. The following parameters will be provided to the handler:
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
export declare function createOrGetUserToken(
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
): Promise<UserToken>;

/**
 * Join `url` with `baseUrl` if `url` is not an absolute url
 *
 * @export
 * @param {string} url
 * @param {string} baseUrl
 * @param {{ [key: string]: string }} [optionalQueries]
 * @returns
 */
export declare function getAbsoluteUrl(
    url: string,
    baseUrl: string,
    optionalQueries?: {
        [key: string]: string;
    }
): string;

export declare function redirectOnSuccess(
    toURL: string,
    req: Request,
    res: Response
): void;

export declare function redirectOnError(
    err: any,
    toURL: string,
    req: Request,
    res: Response
): void;
```
