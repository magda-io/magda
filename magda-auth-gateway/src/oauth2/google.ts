import * as passport from 'passport';
import * as express from 'express';
const GoogleStrategy = require("passport-google-oauth20").Strategy;

import { createOrGet } from '../auth-api-client';
import constants from '../constants';

passport.use(
    new GoogleStrategy(
        {
            clientID: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            callbackURL: `${constants.loginBaseUrl}/google/return`
        },
        function (accessToken: string, refreshToken: string, profile: passport.Profile, cb: (error: any, user?: any, info?: any) => void) {
            createOrGet(profile, 'google').then(userId => cb(null, userId)).catch(error => cb(error));
        }
    )
);

const router = express.Router();

router.get(
    "/",
    passport.authenticate("google", { scope: ["profile", "email"] })
);

router.get(
    "/return",
    passport.authenticate("google", { failureRedirect: "/auth/login" }),
    function (req, res) {
        res.redirect("/auth/");
    }
);

export default router;