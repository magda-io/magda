require("isomorphic-fetch");
const config = require("config");

import { User } from "./model";
import { Maybe } from "tsmonad";

const baseUrl: string = (() => {
    if (config.has("baseAuthApiUrl")) {
        return config.get("baseAuthApiUrl");
    } else if (process.env.NODE_ENV && process.env.NODE_ENV !== "development") {
        return "http://auth-api"
    } else {
        return "http://minikube.data.gov.au:30015";
    }
})() + '/v0';

function handleGetResult(promise: Promise<Response>): Promise<Maybe<User>> {
    return promise.then(res => {
        if (res.status === 404) {
            return Promise.resolve(Maybe.nothing<User>());
        } else {
            return res.json().then(user => Maybe.just(user));
        }
    }).catch(e => {
        console.error(e);
        throw e;
    });
}

export function getUser(userId: string): Promise<Maybe<User>> {
    return handleGetResult(fetch(`${baseUrl}/private/users/${userId}`));
}

export function getUserPublic(userId: string): Promise<Maybe<User>> {
    return handleGetResult(fetch(`${baseUrl}/public/users/${userId}`));
}

export function lookupUser(source: string, sourceId: string): Promise<Maybe<User>> {
    return handleGetResult(fetch(`${baseUrl}/private/users/lookup?source=${source}&sourceId=${sourceId}`));
}

export function createUser(user: User): Promise<User> {
    return fetch(`${baseUrl}/private/users`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(user)
    })
        .then(res => Object.assign({}, user, res.json()))
        .catch(e => {
            console.error(e);
            throw e;
        });
}