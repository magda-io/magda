import { Router } from "express";
import ApiClient from "@magda/authorization-api/dist/ApiClient";
import Authenticator from "./Authenticator";
import * as passport from "passport";

export interface AuthRouterOptions {
    authenticator: Authenticator;
    jwtSecret: string;
    facebookClientId: string;
    facebookClientSecret: string;
    googleClientId: string;
    googleClientSecret: string;
    ckanUrl: string;
    authenticationApi: string;
    externalUrl: string;
}

export default function createAuthRouter(options: AuthRouterOptions): Router {
    const authRouter: Router = Router();
    const authApi = new ApiClient(options.authenticationApi);

    if (options.authenticator) {
        options.authenticator.applyToRoute(authRouter);
    }

    authRouter.use(require("body-parser").urlencoded({ extended: true }));

    const providers = [
        {
            id: "facebook",
            enabled: options.facebookClientId ? true : false,
            authRouter: require("./oauth2/facebook").default({
                authenticationApi: authApi,
                passport: passport,
                clientId: options.facebookClientId,
                clientSecret: options.facebookClientSecret,
                externalAuthHome: `${options.externalUrl}/auth`
            })
        },
        {
            id: "google",
            enabled: options.googleClientId ? true : false,
            authRouter: require("./oauth2/google").default({
                authenticationApi: authApi,
                passport: passport,
                clientId: options.googleClientId,
                clientSecret: options.googleClientSecret,
                externalAuthHome: `${options.externalUrl}/auth`
            })
        },
        {
            id: "ckan",
            enabled: options.ckanUrl ? true : false,
            authRouter: require("./oauth2/ckan").default({
                authenticationApi: authApi,
                passport: passport,
                externalAuthHome: `${options.externalUrl}/auth`
            })
        }
    ];

    // Define routes.
    authRouter.get("/", function(req, res) {
        res.render("home", { user: req.user });
    });

    authRouter.get("/login", function(req, res) {
        res.render("login");
    });

    providers.filter(provider => provider.enabled).forEach(provider => {
        authRouter.use("/login/" + provider.id, provider.authRouter);
    });

    authRouter.get("/providers", (req, res) => {
        res.json(
            providers
                .filter(provider => provider.enabled)
                .map(provider => provider.id)
        );
    });

    authRouter.get(
        "/profile",
        require("connect-ensure-login").ensureLoggedIn(),
        function(req, res) {
            authApi
                .getUser(req.user.id)
                .then(user =>
                    res.render("profile", { user: user.valueOrThrow() })
                )
                .catch((error: Error) => {
                    console.error(error);
                    res.status(500).send("Error");
                });
        }
    );

    authRouter.get("/logout", function(req, res) {
        req.logout();
        res.redirect("/auth");
    });

    return authRouter;
}
