import fetch from "isomorphic-fetch";
import {
    User,
    CreateUserData,
    UserRecord,
    Role,
    Permission,
    OrgUnit,
    OrgUnitRecord,
    CreateRolePermissionInputData,
    UpdateRolePermissionInputData,
    PermissionRecord,
    OperationRecord,
    ResourceRecord
} from "./model";
import { Maybe } from "tsmonad";
import lodash from "lodash";
import buildJwt from "../session/buildJwt";
import addTrailingSlash from "../addTrailingSlash";
import urijs from "urijs";
import { RequiredKeys } from "../utilityTypes";
import ServerError from "../ServerError";
import isUuid from "../util/isUuid";

export default class ApiClient {
    private jwt: string = null;
    private requestInitOption: RequestInit = null;
    private baseUrl: string = "";

    constructor(
        // e.g. http://authorization-api/v0
        baseUrl: string,
        jwtSecret: string = null,
        userId: string = null
    ) {
        this.baseUrl = addTrailingSlash(baseUrl);
        if (jwtSecret && userId) {
            this.jwt = buildJwt(jwtSecret, userId);
        }
        if (this.jwt) {
            this.requestInitOption = {
                headers: {
                    "X-Magda-Session": this.jwt
                }
            };
        }
    }

    getMergeRequestInitOption(extraOptions: RequestInit = null): RequestInit {
        let defaultContentTypeCfg: RequestInit = {};
        if (
            extraOptions?.body &&
            (!extraOptions?.headers ||
                (typeof extraOptions.headers === "object" &&
                    Object.keys(extraOptions.headers)
                        .map((key) => key.toLowerCase())
                        .indexOf("content-type") == -1))
        ) {
            defaultContentTypeCfg = {
                headers: {
                    "Content-Type": "application/json"
                }
            };
        }
        return lodash.merge(
            {},
            this.requestInitOption,
            extraOptions,
            defaultContentTypeCfg
        );
    }

    async processJsonResponse<T = any>(res: Response) {
        if (res.status >= 200 && res.status < 300) {
            return (await res.json()) as T;
        } else {
            const responseText = await res.text();
            throw new ServerError(
                `Error: ${res.statusText}. ${responseText.replace(
                    /<(.|\n)*?>/g,
                    ""
                )}`,
                res.status
            );
        }
    }

    /**
     * Get the data of a user.
     *
     * @param {string} userId
     * @returns {Promise<Maybe<User>>}
     * @memberof ApiClient
     */
    async getUser(userId: string): Promise<Maybe<RequiredKeys<User, "id">>> {
        return await this.handleGetResult(
            fetch(
                `${this.baseUrl}public/users/${userId}`,
                this.getMergeRequestInitOption()
            )
        );
    }

    /**
     * Lookup user by source (identity provider) & sourceId (identity ID)
     *
     * @param {string} source
     * @param {string} sourceId
     * @returns {Promise<Maybe<User>>}
     * @memberof ApiClient
     */
    async lookupUser(
        source: string,
        sourceId: string
    ): Promise<Maybe<RequiredKeys<User, "id">>> {
        if (!source) {
            throw new ServerError("source cannot be empty!", 400);
        }
        if (!sourceId) {
            throw new ServerError("sourceId cannot be empty!", 400);
        }
        const uri = urijs(`${this.baseUrl}public/users`).search({
            source,
            sourceId,
            limit: 1
        });

        const res = await fetch(
            uri.toString(),
            this.getMergeRequestInitOption()
        );
        if (!res.ok) {
            throw new ServerError(await res.text(), res.status);
        }
        const data = await res.json();
        if (!data?.length) {
            return Maybe.nothing<RequiredKeys<User, "id">>();
        }
        return Maybe.just<RequiredKeys<User, "id">>(data[0]);
    }

    /**
     * create a user
     *
     * @param {CreateUserData} user
     * @returns {Promise<UserRecord>}
     * @memberof ApiClient
     */
    async createUser(user: CreateUserData): Promise<UserRecord> {
        try {
            const res = await fetch(
                `${this.baseUrl}public/users`,
                this.getMergeRequestInitOption({
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify(user)
                })
            );
            if (res.status >= 400) {
                throw new Error(
                    `Encountered error ${
                        res.status
                    }: ${await res.text()} when creating new user to ${
                        this.baseUrl
                    }public/users`
                );
            }
            const resData = await res.json();
            return resData;
        } catch (e) {
            console.error(e);
            throw e;
        }
    }

    /**
     * Add Roles to a user.
     * Returns a list of current role ids of the user.
     *
     * @param {string} userId
     * @param {string[]} roleIds
     * @returns {Promise<string[]>}
     * @memberof ApiClient
     */
    async addUserRoles(userId: string, roleIds: string[]): Promise<string[]> {
        const res = await fetch(
            `${this.baseUrl}public/users/${userId}/roles`,
            this.getMergeRequestInitOption({
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(roleIds)
            })
        );
        return await this.processJsonResponse<string[]>(res);
    }

    /**
     * Remove a list roles from a user.
     *
     * @param {string} userId
     * @param {string[]} roleIds
     * @returns {Promise<void>}
     * @memberof ApiClient
     */
    async deleteUserRoles(userId: string, roleIds: string[]): Promise<void> {
        const res = await fetch(
            `${this.baseUrl}public/user/${userId}/roles`,
            this.getMergeRequestInitOption({
                method: "DELETE",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(roleIds)
            })
        );
        await this.processJsonResponse(res);
    }

    /**
     * Get all roles of a user
     *
     * @param {string} userId
     * @returns {Promise<Role[]>}
     * @memberof ApiClient
     */
    async getUserRoles(userId: string): Promise<Role[]> {
        const res = await fetch(
            `${this.baseUrl}public/users/${userId}/roles`,
            this.getMergeRequestInitOption()
        );
        return await this.processJsonResponse<Role[]>(res);
    }

    /**
     * Get all permissions of a user
     *
     * @param {string} userId
     * @returns {Promise<Permission[]>}
     * @memberof ApiClient
     */
    async getUserPermissions(userId: string): Promise<Permission[]> {
        const res = await fetch(
            `${this.baseUrl}public/users/${userId}/permissions`,
            this.getMergeRequestInitOption()
        );
        return await this.processJsonResponse<Permission[]>(res);
    }

    /**
     * Get all permissions of a role
     *
     * @param {string} roleId
     * @returns {Promise<Permission[]>}
     * @memberof ApiClient
     */
    async getRolePermissions(roleId: string): Promise<Permission[]> {
        const res = await fetch(
            `${this.baseUrl}public/roles/${roleId}/permissions`,
            this.getMergeRequestInitOption()
        );
        return await this.processJsonResponse<Permission[]>(res);
    }

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
    async getOrgUnitsByLevel(
        orgLevel: number,
        relationshipOrgUnitId?: string
    ): Promise<OrgUnit[]> {
        const uri = urijs(
            `${this.baseUrl}public/orgunits/bylevel`
        ).segmentCoded(`${orgLevel}`);

        const queries = {} as any;
        if (relationshipOrgUnitId) {
            queries["relationshipOrgUnitId"] = relationshipOrgUnitId;
        }

        const res = await fetch(
            Object.keys(queries).length
                ? uri.search(queries).toString()
                : uri.toString(),
            this.getMergeRequestInitOption()
        );
        return await this.processJsonResponse<OrgUnit[]>(res);
    }

    /**
     * Get orgunits by name
     *
     * @param {string} nodeName
     * @param {boolean} [leafNodesOnly=false] Whether only leaf nodes should be returned
     * @param {string} [relationshipOrgUnitId] Optional; The org unit id that is used to test the relationship with each of returned orgUnit item.
     * @returns {Promise<OrgUnit[]>}
     * @memberof ApiClient
     */
    async getOrgUnitsByName(
        nodeName: string,
        leafNodesOnly: boolean = false,
        relationshipOrgUnitId?: string
    ): Promise<OrgUnit[]> {
        const uri = urijs(`${this.baseUrl}public/orgunits`);

        const queries = {
            nodeName,
            leafNodesOnly
        } as any;
        if (relationshipOrgUnitId) {
            queries["relationshipOrgUnitId"] = relationshipOrgUnitId;
        }

        const res = await fetch(
            uri.search(queries).toString(),
            this.getMergeRequestInitOption()
        );
        return await this.processJsonResponse<OrgUnit[]>(res);
    }

    /**
     * Gets the root organisation unit (top of the tree).
     *
     * @returns {Promise<OrgUnit>}
     * @memberof ApiClient
     */
    async getRootOrgUnit(): Promise<OrgUnit> {
        const res = await fetch(
            `${this.baseUrl}public/orgunits/root`,
            this.getMergeRequestInitOption()
        );
        return await this.processJsonResponse<OrgUnit>(res);
    }

    /**
     * Gets the details of the node with its id.
     *
     * @param {string} nodeId
     * @returns {Promise<OrgUnit>}
     * @memberof ApiClient
     */
    async getOrgUnitById(nodeId: string): Promise<OrgUnit> {
        const uri = urijs(`${this.baseUrl}public/orgunits`).segmentCoded(
            nodeId
        );

        const res = await fetch(
            uri.toString(),
            this.getMergeRequestInitOption()
        );
        return await this.processJsonResponse<OrgUnit>(res);
    }

    /**
     * Gets all the children immediately below the requested node. If the node doesn't exist, returns an empty list.
     *
     * @param {string} nodeId
     * @returns {Promise<OrgUnit[]>}
     * @memberof ApiClient
     */
    async getImmediateOrgUnitChildren(nodeId: string): Promise<OrgUnit[]> {
        const uri = urijs(`${this.baseUrl}public/orgunits`)
            .segmentCoded(nodeId)
            .segmentCoded("children")
            .segmentCoded("immediate");

        const res = await fetch(
            uri.toString(),
            this.getMergeRequestInitOption()
        );
        return await this.processJsonResponse<OrgUnit[]>(res);
    }

    /**
     * Gets all the children below the requested node recursively. If node doesn't exist, returns an empty list.
     *
     * @param {string} nodeId
     * @returns {Promise<OrgUnit[]>}
     * @memberof ApiClient
     */
    async getAllOrgUnitChildren(nodeId: string): Promise<OrgUnit[]> {
        const uri = urijs(`${this.baseUrl}public/orgunits`)
            .segmentCoded(nodeId)
            .segmentCoded("children")
            .segmentCoded("all");

        const res = await fetch(
            uri.toString(),
            this.getMergeRequestInitOption()
        );
        return await this.processJsonResponse<OrgUnit[]>(res);
    }

    async createOrgNode(
        parentNodeId: string,
        node: Partial<
            Omit<
                OrgUnitRecord,
                | "id"
                | "createBy"
                | "createTime"
                | "editBy"
                | "editTime"
                | "left"
                | "right"
            >
        >
    ): Promise<OrgUnit> {
        const uri = urijs(`${this.baseUrl}public/orgunits`)
            .segmentCoded(parentNodeId)
            .segmentCoded("insert");
        const res = await fetch(
            uri.toString(),
            this.getMergeRequestInitOption({
                method: "post",
                body: JSON.stringify(node)
            })
        );
        return await this.processJsonResponse<OrgUnit>(res);
    }

    async createRole(name: string, desc?: string): Promise<Role> {
        const uri = urijs(`${this.baseUrl}public/roles`);
        const res = await fetch(
            uri.toString(),
            this.getMergeRequestInitOption({
                method: "post",
                body: JSON.stringify({
                    name,
                    description: desc ? desc : ""
                })
            })
        );
        return await this.processJsonResponse<Role>(res);
    }

    async createRolePermission(
        roleId: string,
        permissionData: CreateRolePermissionInputData
    ): Promise<PermissionRecord> {
        if (!isUuid(roleId)) {
            throw new ServerError(`roleId: ${roleId} is not a valid UUID.`);
        }
        const uri = urijs(`${this.baseUrl}public/roles`)
            .segmentCoded(roleId)
            .segmentCoded("permissions");
        const res = await fetch(
            uri.toString(),
            this.getMergeRequestInitOption({
                method: "post",
                body: JSON.stringify(permissionData)
            })
        );
        return await this.processJsonResponse<PermissionRecord>(res);
    }

    async createPermission(
        permissionData: CreateRolePermissionInputData
    ): Promise<PermissionRecord> {
        const uri = urijs(`${this.baseUrl}public/permissions`);
        const res = await fetch(
            uri.toString(),
            this.getMergeRequestInitOption({
                method: "post",
                body: JSON.stringify(permissionData)
            })
        );
        return await this.processJsonResponse<PermissionRecord>(res);
    }

    async updatePermission(
        id: string,
        permissionData: UpdateRolePermissionInputData
    ): Promise<PermissionRecord> {
        if (!permissionData || !Object.keys(permissionData).length) {
            throw new Error("Empty data supplied to update permission!");
        }
        const uri = urijs(`${this.baseUrl}public/permissions`);
        const res = await fetch(
            uri.toString(),
            this.getMergeRequestInitOption({
                method: "put",
                body: JSON.stringify(permissionData)
            })
        );
        return await this.processJsonResponse<PermissionRecord>(res);
    }

    async getOperationByUri(opUri: string) {
        const uri = urijs(`${this.baseUrl}public/operations/byUri/${opUri}`);
        const res = await fetch(
            uri.toString(),
            this.getMergeRequestInitOption()
        );
        return await this.processJsonResponse<OperationRecord>(res);
    }

    async getResourceByUri(resUri: string) {
        const uri = urijs(`${this.baseUrl}public/resources/byUri/${resUri}`);
        const res = await fetch(
            uri.toString(),
            this.getMergeRequestInitOption()
        );
        return await this.processJsonResponse<ResourceRecord>(res);
    }

    private async handleGetResult<T = User>(
        promise: Promise<Response>
    ): Promise<Maybe<T>> {
        return promise
            .then((res) => {
                if (res.status === 404) {
                    return Promise.resolve(Maybe.nothing<User>());
                } else {
                    return res
                        .text()
                        .then((resText) => {
                            try {
                                return JSON.parse(resText);
                            } catch (e) {
                                throw new Error(resText);
                            }
                        })
                        .then((user) => Maybe.just(user));
                }
            })
            .catch((e) => {
                console.error(e);
                throw e;
            });
    }
}
