import * as express from 'express';
import { Router } from 'express';
const GoogleStrategy = require("passport-google-oauth20").Strategy;
import { Passport, Profile } from 'passport';

import ApiClient from '@magda/auth-api/dist/ApiClient';
import createOrGetUserToken from '../createOrGetUserToken';
import constants from '../constants';
import { redirectOnSuccess, redirectOnError } from './redirect';

export default function google(authApi: ApiClient, passport: Passport, clientId: string, clientSecret: string) {
    passport.use(
        new GoogleStrategy(
            {
                clientID: clientId,
                clientSecret: clientSecret,
                callbackURL: `${constants.loginBaseUrl}/google/return`
            },
            function (accessToken: string, refreshToken: string, profile: Profile, cb: (error: any, user?: any, info?: any) => void) {
                createOrGetUserToken(authApi, profile, 'google').then(userId => cb(null, userId)).catch(error => cb(error));
            }
        )
    );

    const router: Router = express.Router();

    router.get(
        "/",
        (req, res, next) => {
            const options: any = {
                scope: ["profile", "email"],
                state: req.query.redirect || constants.authHome
            };
            passport.authenticate("google", options)(req, res, next);
        }
    );

    router.get(
        "/return",
        (req: express.Request, res: express.Response, next: express.NextFunction) => {
            passport.authenticate("google", {
                failWithError: true
            })(req, res, next)
        },
        (req: express.Request, res: express.Response, next: express.NextFunction) => {
            redirectOnSuccess(req.query.state, req, res);
        },
        (err: any, req: express.Request, res: express.Response, next: express.NextFunction): any => {
            redirectOnError(err, req.query.state, req, res);
        }
    );

    return router;
}
