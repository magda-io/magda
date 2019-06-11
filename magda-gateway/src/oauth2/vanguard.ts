import { Strategy } from "passport-wsfed-saml2";

import * as express from "express";
import { Router } from "express";
import { Authenticator, Profile } from "passport";

import ApiClient from "@magda/typescript-common/dist/authorization-api/ApiClient";
import createOrGetUserToken from "../createOrGetUserToken";
import { redirectOnSuccess } from "./redirect";

export interface VanguardOptions {
    authorizationApi: ApiClient;
    passport: Authenticator;
    wsFedIdpUrl: string;
    wsFedRealm: string;
    wsFedCertificate: string;
    externalAuthHome: string;
}

const STRATEGY = "vanguard";

export default function vanguard(options: VanguardOptions) {
    const authorizationApi = options.authorizationApi;
    const passport = options.passport;
    const wsFedIdpUrl = options.wsFedIdpUrl;
    const wsFedRealm = options.wsFedRealm;
    const wsFedCertificate = options.wsFedCertificate;
    const externalAuthHome = options.externalAuthHome;

    // const loginBaseUrl = `${externalAuthHome}/login`;

    if (!wsFedIdpUrl || !wsFedRealm || !wsFedCertificate) {
        return undefined;
    }

    passport.use(
        STRATEGY,
        new Strategy(
            {
                identityProviderUrl: wsFedIdpUrl,
                realm: wsFedRealm,
                protocol: "wsfed",
                cert: wsFedCertificate
            },
            function(profile: Profile, cb: Function) {
                createOrGetUserToken(authorizationApi, profile, "vanguard")
                    .then(userId => cb(null, userId))
                    .catch(error => cb(error));
            }
        )
    );

    const router: Router = express.Router();

    router.all("/", (req, res, next) => {
        passport.authenticate(STRATEGY, {})(req, res, next);
    });

    router.all(
        "/return",
        passport.authenticate(STRATEGY, {
            failureRedirect: "/",
            failureFlash: true
        }),
        function(req, res) {
            redirectOnSuccess(req.query.redirect || externalAuthHome, req, res);
        }
    );

    return router;
}
