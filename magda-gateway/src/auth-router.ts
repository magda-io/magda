import { Router } from "express";

import googleAuthRouter from './oauth2/google';
import fbAuthRouter from './oauth2/facebook';
import ckanAuthRouter from './oauth2/ckan';
import { getUser } from '@magda/auth-api/lib/src/client';
import setupAuth from './setup-auth';

const authRouter: Router = Router();

setupAuth(authRouter);
authRouter.use(require("body-parser").urlencoded({ extended: true }));

// Define routes.
authRouter.get("/", function (req, res) {
    res.render("home", { user: req.user });
});

authRouter.get("/login", function (req, res) {
    res.render("login");
});

authRouter.use('/login/google', googleAuthRouter);
authRouter.use('/login/facebook', fbAuthRouter);
authRouter.use('/login/ckan', ckanAuthRouter);

authRouter.get("/profile", require("connect-ensure-login").ensureLoggedIn(), function (req, res) {
    getUser(req.user.id).then(user =>
        res.render("profile", { user: user.valueOrThrow() })
    );
});

authRouter.get("/logout", function (req, res) {
    req.logout();
    res.redirect("/auth");
});

export default authRouter;
