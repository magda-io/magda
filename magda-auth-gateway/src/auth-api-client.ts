require("isomorphic-fetch");
const config = require("config");

import * as passport from 'passport';
import { User } from "@magda/auth-api/src/model";
import { Maybe } from "tsmonad";

const baseUrl = `${config.get("baseAuthApiUrl")}/v0`;

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
    return handleGetResult(fetch(`${baseUrl}/users/${userId}`));
}

export function lookupUser(source: string, sourceId: string): Promise<Maybe<User>> {
    return handleGetResult(fetch(`${baseUrl}/users/lookup?source=${source}&sourceId=${sourceId}`));
}

export function createUser(user: User): Promise<User> {
    console.log(user);
    return fetch(`${baseUrl}/users`, {
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

export function createOrGet(profile: passport.Profile, source: string): Promise<String> {
    const user = profileToUser(profile, source);

    return lookupUser(user.source, user.sourceId).then(maybe => maybe.caseOf({
        just: user => Promise.resolve(<string>user.id),
        nothing: () => createUser(user).then(user => <string>user.id)
    }));
};

function profileToUser(profile: passport.Profile, source: string): User {
    if (!profile.emails || profile.emails.length === 0) {
        throw new Error("User with no email address");
    }

    return {
        displayName: profile.displayName,
        email: profile.emails[0].value,
        photoURL: profile.photos && profile.photos.length > 0 ? profile.photos[0].value : undefined,
        source: source,
        sourceId: profile.id
    }
}