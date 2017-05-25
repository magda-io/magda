
import * as passport from 'passport';
import * as express from 'express';
const LocalStrategy = require("passport-local").Strategy;

import loginToCkan from "./login-to-ckan";
import { createOrGet } from '../auth-api-client';

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

const router = express.Router();

router.get("/", function (req, res) {
    res.render("form");
});

router.post(
    "/",
    passport.authenticate("local", { failureRedirect: "/auth/login" }),
    function (req, res) {
        res.redirect("/auth/");
    }
);

export default router;