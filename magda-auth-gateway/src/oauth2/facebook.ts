// import * as passport from 'passport';
const passport = require('passport');
const FBStrategy = require('passport-facebook').Strategy
import * as express from 'express';
import createOrGet from '../create-or-get';
import constants from '../constants';
import { Profile } from 'passport';

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
            callbackURL: `${constants.loginBaseUrl}/facebook/return?source=${encodeURIComponent(req.query.source)}`
        })(req, res, next)
    }
);

router.get(
    "/return",
    function (req, res, next) {
        passport.authenticate("facebook", {
            failureRedirect: req.query.source,
            callbackURL: `${constants.loginBaseUrl}/facebook/return?source=${encodeURIComponent(req.query.source)}`
        })(req, res, next);
    },
    function (req, res, next) {
        const source = decodeURIComponent(req.query.source);
        res.redirect(source);
    }
);

export default router;