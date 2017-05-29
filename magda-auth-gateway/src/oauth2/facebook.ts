import * as passport from 'passport';
import * as express from 'express';
import createOrGet from '../create-or-get';
import { Strategy as FBStrategy } from 'passport-facebook';
import constants from '../constants';

passport.use(
    new FBStrategy(
        {
            clientID: process.env.FACEBOOK_CLIENT_ID,
            clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
            callbackURL: `${constants.loginBaseUrl}/facebook/return`,
            profileFields: ["displayName", "picture", "email"]
        },
        function (accessToken, refreshToken, profile, cb) {
            createOrGet(profile, 'facebook').then(userId => cb(null, userId)).catch(error => cb(error));
        }
    )
);

const router = express.Router();

router.get(
    "/",
    passport.authenticate("facebook", { scope: ["public_profile", "email"] })
);

router.get(
    "/return",
    passport.authenticate("facebook", { failureRedirect: "/auth/login" }),
    function (req, res) {
        res.redirect("/auth/");
    }
);

export default router;