import * as passport from 'passport';
import * as express from 'express';
import { User, createOrGet } from "../db/db";
import { Strategy as FBStrategy } from 'passport-facebook';

passport.use(
    new FBStrategy(
        {
            clientID: process.env.FACEBOOK_CLIENT_ID,
            clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
            callbackURL: "http://localhost:3000/login/facebook/return",
            profileFields: ["displayName", "picture", "email"]
        },
        function (accessToken, refreshToken, profile, cb) {
            createOrGet(profile, 'facebook').then((user: User) => cb(null, user)).catch(error => cb(error));
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
    passport.authenticate("facebook", { failureRedirect: "/login" }),
    function (req, res) {
        res.redirect("/");
    }
);

export default router;