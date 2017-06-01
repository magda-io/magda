// import * as passport from 'passport';
const passport = require('passport');
const FBStrategy = require('passport-facebook').Strategy
import * as express from 'express';
import { Profile } from 'passport';

import createOrGet from '../create-or-get';
import constants from '../constants';
import { redirectOnSuccess, redirectOnError } from './redirect';

passport.use(
    new FBStrategy(
        {
            clientID: process.env.FACEBOOK_CLIENT_ID,
            clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
            profileFields: ["displayName", "picture", "email"]
        },
        function (accessToken: string, refreshToken: string, profile: Profile, cb: Function) {
            createOrGet(profile, 'facebook').then(userId => cb(null, userId)).catch(error => cb(error));
        }
    )
);

const router = express.Router();

router.get(
    "/",
    (req, res, next) => {
        passport.authenticate('facebook', {
            scope: ["public_profile", "email"],
            callbackURL: `${constants.loginBaseUrl}/facebook/return?redirect=${encodeURIComponent(req.query.redirect)}`
        })(req, res, next)
    }
);

router.get(
    "/return",
    function (req: express.Request, res: express.Response, next: express.NextFunction) {
        passport.authenticate("facebook", {
            callbackURL: `${constants.loginBaseUrl}/facebook/return?redirect=${encodeURIComponent(req.query.redirect)}`,
            failWithError: true
        })(req, res, next);
    },
    (req: express.Request, res: express.Response, next: express.NextFunction) => {
        redirectOnSuccess(req.query.redirect, req, res);
    },
    (err: any, req: express.Request, res: express.Response, next: express.NextFunction): any => {
        redirectOnError(err, req.query.redirect, req, res);
    }
);

export default router;