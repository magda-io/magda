const passport = require('passport');
import * as express from 'express';
const GoogleStrategy = require("passport-google-oauth20").Strategy;
import { Profile } from 'passport';

import createOrGet from '../create-or-get';
import constants from '../constants';
import { redirectOnSuccess, redirectOnError } from './redirect';

passport.use(
    new GoogleStrategy(
        {
            clientID: process.env.GOOGLE_CLIENT_ID || process.env.npm_package_config_GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET || process.env.npm_package_config_GOOGLE_CLIENT_SECRET,
            callbackURL: `${constants.loginBaseUrl}/google/return`
        },
        function (accessToken: string, refreshToken: string, profile: Profile, cb: (error: any, user?: any, info?: any) => void) {
            createOrGet(profile, 'google').then(userId => cb(null, userId)).catch(error => cb(error));
        }
    )
);

const router = express.Router();

router.get(
    "/",
    (req, res, next) => {
        passport.authenticate("google", {
            scope: ["profile", "email"],
            state: req.query.redirect || constants.authHome
        })(req, res, next);
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

export default router;
