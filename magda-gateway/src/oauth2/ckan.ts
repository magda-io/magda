
import * as passport from 'passport';
import * as express from 'express';
import { Router } from 'express';
const LocalStrategy = require("passport-local").Strategy;

import loginToCkan from "./login-to-ckan";
import createOrGet from '../create-or-get';
import constants from '../constants';
import { redirectOnSuccess, redirectOnError } from './redirect';

passport.use(
    new LocalStrategy(function (username: string, password: string, cb: (error: any, user?: any, info?: any) => void) {
        loginToCkan(username, password).then(result => {
            result.caseOf({
                left: error => cb(error),
                right: profile => {
                    createOrGet(profile, 'ckan')
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

export default router;
