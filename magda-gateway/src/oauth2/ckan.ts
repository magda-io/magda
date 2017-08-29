
import { Passport } from 'passport';
import * as express from 'express';
import { Router } from 'express';
import { Strategy as LocalStrategy } from "passport-local";

import ApiClient from '@magda/auth-api/dist/ApiClient';
import loginToCkan from "./loginToCkan";
import createOrGetUserToken from '../createOrGetUserToken';
import constants from '../constants';
import { redirectOnSuccess, redirectOnError } from './redirect';

export default function ckan(authApi: ApiClient, passport: Passport) {
    passport.use(
        new LocalStrategy(function (username: string, password: string, cb: (error: any, user?: any, info?: any) => void) {
            loginToCkan(username, password).then(result => {
                result.caseOf({
                    left: error => cb(error),
                    right: profile => {
                        createOrGetUserToken(authApi, profile, 'ckan')
                            .then(userId => cb(null, userId))
                            .catch(error => cb(error));
                    }
                });
            });
        })
    );

    const router: Router = express.Router();

    router.get("/", function (req, res) {
        res.render("form");
    });

    router.post(
        "/",
        (req: express.Request, res: express.Response, next: express.NextFunction) => {
            passport.authenticate("local", {
                failWithError: true
            })(req, res, next)
        },
        (req: express.Request, res: express.Response, next: express.NextFunction) => {
            redirectOnSuccess(req.query.redirect || constants.authHome, req, res);
        },
        (err: any, req: express.Request, res: express.Response, next: express.NextFunction): any => {
            redirectOnError(err, req.query.redirect || constants.authHome, req, res);
        }
    );

    return router;
}
