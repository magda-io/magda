
import * as passport from 'passport';
import * as express from 'express';
const LocalStrategy = require("passport-local").Strategy;

import { User, createOrGet } from "../db/db";
import loginToCkan from "../ckan/login-to-ckan";

passport.use(
    new LocalStrategy(function (username: string, password: string, cb: (error: any, user?: any, info?: any) => void) {
        loginToCkan(username, password).then(result => {
            result.caseOf({
                left: error => cb(error),
                right: profile => {
                    createOrGet(profile, 'ckan')
                        .then((user: User) => cb(null, user))
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
    passport.authenticate("local", { failureRedirect: "/login" }),
    function (req, res) {
        res.redirect("/");
    }
);

export default router;