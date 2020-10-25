### MAGDA Auth API Client

A client lib used to communicate with [Magda](https://github.com/magda-io/magda)'s authorisation API.
This client lib is designed to be used within the cluster internally.

```typescript
export default class ApiClient {
    constructor(baseUrl: string, jwtSecret?: string, userId?: string);

    /**
     * Get the data of a user.
     *
     * @param {string} userId
     * @returns {Promise<Maybe<User>>}
     * @memberof ApiClient
     */
    getUser(userId: string): Promise<Maybe<User>>;

    /**
     * Lookup user by source (identity provider) & sourceId (identity ID)
     *
     * @param {string} source
     * @param {string} sourceId
     * @returns {Promise<Maybe<User>>}
     * @memberof ApiClient
     */
    lookupUser(source: string, sourceId: string): Promise<Maybe<User>>;

    /**
     * create a user
     *
     * @param {User} user
     * @returns {Promise<User>}
     * @memberof ApiClient
     */
    createUser(user: User): Promise<User>;

    /**
     * Add Roles to a user.
     * Returns a list of current role ids of the user.
     *
     * @param {string} userId
     * @param {string[]} roleIds
     * @returns {Promise<string[]>}
     * @memberof ApiClient
     */
    addUserRoles(userId: string, roleIds: string[]): Promise<string[]>;

    /**
     * Remove a list roles from a user.
     *
     * @param {string} userId
     * @param {string[]} roleIds
     * @returns {Promise<void>}
     * @memberof ApiClient
     */
    deleteUserRoles(userId: string, roleIds: string[]): Promise<void>;

    /**
     * Get all roles of a user
     *
     * @param {string} userId
     * @returns {Promise<Role[]>}
     * @memberof ApiClient
     */
    getUserRoles(userId: string): Promise<Role[]>;

    /**
     * Get all permissions of a user
     *
     * @param {string} userId
     * @returns {Promise<Permission[]>}
     * @memberof ApiClient
     */
    getUserPermissions(userId: string): Promise<Permission[]>;

    /**
     * Get all permissions of a role
     *
     * @param {string} roleId
     * @returns {Promise<Permission[]>}
     * @memberof ApiClient
     */
    getRolePermissions(roleId: string): Promise<Permission[]>;
}
```
