require("isomorphic-fetch");

import { User, Role, Permission } from "./model";
import { Maybe } from "tsmonad";
import lodash from "lodash";
import buildJwt from "../session/buildJwt";
import GenericError from "./GenericError";

export default class ApiClient {
    private jwt: string = null;
    private requestInitOption: RequestInit = null;

    constructor(
        readonly baseUrl: string,
        jwtSecret: string = null,
        userId: string = null
    ) {
        if (jwtSecret && userId) {
            this.jwt = buildJwt(jwtSecret, userId);
        }
        this.requestInitOption = {
            headers: {
                "X-Magda-Session": this.jwt
            }
        };
    }

    getMergeRequestInitOption(extraOptions: RequestInit = null): RequestInit {
        return lodash.merge({}, this.requestInitOption, extraOptions);
    }

    async processJsonResponse<T = any>(res: Response) {
        if (res.status >= 200 && res.status < 300) {
            return (await res.json()) as T;
        } else {
            const responseText = (await res.text()).replace(/<(.|\n)*?>/g, "");
            throw new GenericError(responseText, res.status);
        }
    }

    /**
     * Get the data of a user.
     *
     * @param {string} userId
     * @returns {Promise<Maybe<User>>}
     * @memberof ApiClient
     */
    async getUser(userId: string): Promise<Maybe<User>> {
        return await this.handleGetResult(
            fetch(
                `${this.baseUrl}/private/users/${userId}`,
                this.getMergeRequestInitOption()
            )
        );
    }

    /**
     * Get the data of a user.
     * This is the public facing API and will return less fields
     *
     * @param {string} userId
     * @returns {Promise<Maybe<User>>}
     * @memberof ApiClient
     */
    async getUserPublic(userId: string): Promise<Maybe<User>> {
        return await this.handleGetResult(
            fetch(
                `${this.baseUrl}/public/users/${userId}`,
                this.getMergeRequestInitOption()
            )
        );
    }

    /**
     * Lookup user by source & sourceId
     *
     * @param {string} source
     * @param {string} sourceId
     * @returns {Promise<Maybe<User>>}
     * @memberof ApiClient
     */
    async lookupUser(source: string, sourceId: string): Promise<Maybe<User>> {
        return this.handleGetResult(
            fetch(
                `${this.baseUrl}/private/users/lookup?source=${source}&sourceId=${sourceId}`,
                this.getMergeRequestInitOption()
            )
        );
    }

    /**
     * create a user
     *
     * @param {User} user
     * @returns {Promise<User>}
     * @memberof ApiClient
     */
    async createUser(user: User): Promise<User> {
        try {
            const res = await fetch(
                `${this.baseUrl}/private/users`,
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
                    `Encountered error ${res.status} when POSTing new user to ${this.baseUrl}/private/users`
                );
            }
            const resData = await res.json();
            return { ...user, ...resData };
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
            `${this.baseUrl}/public/user/${userId}/roles`,
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
            `${this.baseUrl}/public/user/${userId}/roles`,
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
            `${this.baseUrl}/public/user/${userId}/roles`,
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
            `${this.baseUrl}/public/user/${userId}/permissions`,
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
            `${this.baseUrl}/public/role/${roleId}/permissions`,
            this.getMergeRequestInitOption()
        );
        return await this.processJsonResponse<Permission[]>(res);
    }

    private async handleGetResult(
        promise: Promise<Response>
    ): Promise<Maybe<User>> {
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
