require("isomorphic-fetch");

import { User } from "./model";
import { Maybe } from "tsmonad";

export default class ApiClient {
    constructor(readonly baseUrl: string) {}

    getUser(userId: string): Promise<Maybe<User>> {
        return this.handleGetResult(
            fetch(`${this.baseUrl}/private/users/${userId}`)
        );
    }

    getUserPublic(userId: string): Promise<Maybe<User>> {
        return this.handleGetResult(
            fetch(`${this.baseUrl}/public/users/${userId}`)
        );
    }

    lookupUser(source: string, sourceId: string): Promise<Maybe<User>> {
        return this.handleGetResult(
            fetch(
                `${this
                    .baseUrl}/private/users/lookup?source=${source}&sourceId=${sourceId}`
            )
        );
    }

    createUser(user: User): Promise<User> {
        return fetch(`${this.baseUrl}/private/users`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(user)
        })
            .then(res => res.json())
            .then(res => {
                if (res.status >= 400) {
                    throw new Error(
                        `Encountered error ${res.status} when POSTing new user to ${this
                            .baseUrl}/private/users`
                    );
                }
                return Object.assign({}, user, res);
            })
            .catch(e => {
                console.error(e);
                throw e;
            });
    }

    private handleGetResult(promise: Promise<Response>): Promise<Maybe<User>> {
        return promise
            .then(res => {
                if (res.status === 404) {
                    return Promise.resolve(Maybe.nothing<User>());
                } else {
                    return res.json().then(user => Maybe.just(user));
                }
            })
            .catch(e => {
                console.error(e);
                throw e;
            });
    }
}
