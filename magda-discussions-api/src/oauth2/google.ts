
import * as passport from 'passport';
import * as express from 'express';
import { User, createOrGet } from "../db/db";
const GoogleStrategy = require("passport-google-oauth20").Strategy;

passport.use(
    new GoogleStrategy(
        {
            clientID: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            callbackURL: "http://localhost:3000/login/google/return"
        },
        function (accessToken: string, refreshToken: string, profile: passport.Profile, cb: (error: any, user?: any, info?: any) => void) {
            createOrGet(profile, 'google').then((user: User) => cb(null, user)).catch(error => cb(error));
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
    passport.authenticate("google", { failureRedirect: "/login" }),
    function (req, res) {
        res.redirect("/");
    }
);

export default router;