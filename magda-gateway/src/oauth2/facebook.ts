import { Strategy as FBStrategy } from "passport-facebook";
import * as express from "express";
import { Router } from "express";
import { Passport, Profile } from "passport";

import ApiClient from '@magda/auth-api/dist/ApiClient';
import createOrGetUserToken from "../createOrGetUserToken";
import constants from "../constants";
import { redirectOnSuccess, redirectOnError } from "./redirect";

export default function facebook(authApi: ApiClient, passport: Passport, clientId: string, clientSecret: string) {
    passport.use(
        new FBStrategy(
            {
                clientID: clientId,
                clientSecret: clientSecret,
                profileFields: ["displayName", "picture", "email"],
                callbackURL: undefined
            },
            function (
                accessToken: string,
                refreshToken: string,
                profile: Profile,
                cb: Function
            ) {
                createOrGetUserToken(authApi, profile, "facebook")
                    .then(userId => cb(null, userId))
                    .catch(error => cb(error));
            }
        )
    );

    const router: Router = express.Router();

    router.get("/", (req, res, next) => {
        // callbackURL property from https://github.com/jaredhanson/passport-facebook/issues/2
        // But it's not in the typescript defintions (as of @types/passport@0.3.4), so we need
        // sneak it in via an `any`.
        const options: any = {
            scope: ["public_profile", "email"],
            callbackURL: `${constants.loginBaseUrl}/facebook/return?redirect=${encodeURIComponent(
                req.query.redirect || constants.authHome
            )}`
        };
        passport.authenticate("facebook", options)(req, res, next);
    });

    router.get(
        "/return",
        function (
            req: express.Request,
            res: express.Response,
            next: express.NextFunction
        ) {
            const options: any = {
                callbackURL: `${constants.loginBaseUrl}/facebook/return?redirect=${encodeURIComponent(
                    req.query.redirect || constants.authHome
                )}`,
                failWithError: true
            };
            passport.authenticate("facebook", options)(req, res, next);
        },
        (req: express.Request, res: express.Response, next: express.NextFunction) => {
            redirectOnSuccess(req.query.redirect || constants.authHome, req, res);
        },
        (
            err: any,
            req: express.Request,
            res: express.Response,
            next: express.NextFunction
        ): any => {
            console.error(err);
            redirectOnError(err, req.query.redirect || constants.authHome, req, res);
        }
    );

    return router;
}
