"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("isomorphic-fetch");
const config = require("config");
const tsmonad_1 = require("tsmonad");
const baseUrl =
    (() => {
        if (config.has("baseAuthApiUrl")) {
            return config.get("baseAuthApiUrl");
        } else if (
            process.env.NODE_ENV &&
            process.env.NODE_ENV !== "development"
        ) {
            return "http://auth-api";
        } else {
            return "http://minikube.data.gov.au:30015";
        }
    })() + "/v0";
function handleGetResult(promise) {
    return promise
        .then(res => {
            if (res.status === 404) {
                return Promise.resolve(tsmonad_1.Maybe.nothing());
            } else {
                return res.json().then(user => tsmonad_1.Maybe.just(user));
            }
        })
        .catch(e => {
            console.error(e);
            throw e;
        });
}
function getUser(userId) {
    return handleGetResult(fetch(`${baseUrl}/private/users/${userId}`));
}
exports.getUser = getUser;
function getUserPublic(userId) {
    return handleGetResult(fetch(`${baseUrl}/public/users/${userId}`));
}
exports.getUserPublic = getUserPublic;
function lookupUser(source, sourceId) {
    return handleGetResult(
        fetch(
            `${baseUrl}/private/users/lookup?source=${source}&sourceId=${sourceId}`
        )
    );
}
exports.lookupUser = lookupUser;
function createUser(user) {
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
exports.createUser = createUser;
//# sourceMappingURL=client.js.map
