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

    /**
     * List OrgUnits at certain org tree level.
     * Optionally provide a test Org Unit Id that will be used to test the relationship with each of returned orgUnit item.
     * Possible Value: 'ancestor', 'descendant', 'equal', 'unrelated'
     *
     * @param {string} orgLevel The level number (starts from 1) where org Units of the tree are taken horizontally.
     * @param {string} [relationshipOrgUnitId] Optional; The org unit id that is used to test the relationship with each of returned orgUnit item.
     * @returns {Promise<OrgUnit[]>}
     * @memberof ApiClient
     */
    getOrgUnitsByLevel(
        orgLevel: string,
        relationshipOrgUnitId?: string
    ): Promise<OrgUnit[]>;

    /**
     * Get orgunits by name
     *
     * @param {string} nodeName
     * @param {boolean} [leafNodesOnly=false] Whether only leaf nodes should be returned
     * @param {string} [relationshipOrgUnitId] Optional; The org unit id that is used to test the relationship with each of returned orgUnit item.
     * @returns {Promise<OrgUnit[]>}
     * @memberof ApiClient
     */
    getOrgUnitsByName(
        nodeName: string,
        leafNodesOnly?: boolean,
        relationshipOrgUnitId?: string
    ): Promise<OrgUnit[]>;

    /**
     * Gets the root organisation unit (top of the tree).
     *
     * @returns {Promise<OrgUnit>}
     * @memberof ApiClient
     */
    getRootOrgUnit(): Promise<OrgUnit>;

    /**
     * Gets the details of the node with its id.
     *
     * @param {string} nodeId
     * @returns {Promise<OrgUnit>}
     * @memberof ApiClient
     */
    getOrgUnitById(nodeId: string): Promise<OrgUnit>;

    /**
     * Gets all the children immediately below the requested node. If the node doesn't exist, returns an empty list.
     *
     * @param {string} nodeId
     * @returns {Promise<OrgUnit[]>}
     * @memberof ApiClient
     */
    getImmediateOrgUnitChildren(nodeId: string): Promise<OrgUnit[]>;

    /**
     * Gets all the children below the requested node recursively. If node doesn't exist, returns an empty list.
     *
     * @param {string} nodeId
     * @returns {Promise<OrgUnit[]>}
     * @memberof ApiClient
     */
    getAllOrgUnitChildren(nodeId: string): Promise<OrgUnit[]>;
}
```
