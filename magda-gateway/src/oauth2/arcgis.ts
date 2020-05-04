import express from "express";
import { Strategy as ArcGISStrategy } from "passport-arcgis";
import { Authenticator, Profile } from "passport";

import ApiClient from "magda-typescript-common/src/authorization-api/ApiClient";
import createOrGetUserToken from "../createOrGetUserToken";
import { redirectOnSuccess, redirectOnError } from "./redirect";

export interface ArcGisOptions {
    authorizationApi: ApiClient;
    passport: Authenticator;
    clientId: string;
    clientSecret: string;
    externalAuthHome: string;
    arcgisInstanceBaseUrl: string;
    esriOrgGroup: string;
}

interface StrategyOptions {
    clientID: string;
    clientSecret: string;
    callbackURL: string;
    authorizationURL?: string;
    tokenURL?: string;
    userProfileURL?: string;
}

export default function arcgis(options: ArcGisOptions) {
    const authorizationApi = options.authorizationApi;
    const passport = options.passport;
    const clientId = options.clientId;
    const clientSecret = options.clientSecret;
    const externalAuthHome = options.externalAuthHome;
    const loginBaseUrl = `${externalAuthHome}/login`;
    const esriOrgGroup = options.esriOrgGroup;

    if (!clientId) {
        return undefined;
    }

    const strategyOptions: StrategyOptions = {
        clientID: clientId,
        clientSecret: clientSecret,
        callbackURL: `${loginBaseUrl}/arcgis/return`
    };

    // Expect options.arcgisInstanceBaseUrl to be something like https://some.portal.gov.au/arcgis
    if (options.arcgisInstanceBaseUrl) {
        // Overrides 'https://www.arcgis.com/sharing/oauth2/authorize'
        strategyOptions.authorizationURL = `${options.arcgisInstanceBaseUrl}/sharing/oauth2/authorize`;

        // Overrides 'https://www.arcgis.com/sharing/oauth2/token'
        strategyOptions.tokenURL = `${options.arcgisInstanceBaseUrl}/sharing/oauth2/token`;

        // Overrides 'https://www.arcgis.com/sharing/rest/community/self?f=json'
        strategyOptions.userProfileURL = `${options.arcgisInstanceBaseUrl}/sharing/rest/community/self?f=json`;
    }

    passport.use(
        new ArcGISStrategy(strategyOptions, function(
            accessToken: string,
            refreshToken: string,
            profile: Profile,
            cb: (error: any, user?: any, info?: any) => void
        ) {
            // ArcGIS Passport provider incorrect defines email instead of emails
            if ((profile as any).email) {
                profile.emails = profile.emails || [];
                profile.emails.push({ value: (profile as any).email });
            }

            profile.displayName =
                profile.displayName ||
                ((profile as any)._json && (profile as any)._json.thumbnail);

            createOrGetUserToken(authorizationApi, profile, "arcgis")
                .then(userToken => {
                    const url = `${options.arcgisInstanceBaseUrl}/sharing/rest/community/users/${profile.username}?f=json&token=${accessToken}`;
                    fetch(url, { method: "get" })
                        .then(res => {
                            return res.json();
                        })
                        .then(jsObj => {
                            const theGroups: any[] = jsObj["groups"];
                            const groupIds: string[] = theGroups.map(group => {
                                return group["id"];
                            });

                            const theGroupIds = esriOrgGroup
                                ? groupIds.concat([esriOrgGroup])
                                : groupIds;

                            cb(null, {
                                id: userToken.id,
                                session: {
                                    esriGroups: theGroupIds,
                                    esriUser: profile.username
                                }
                            });
                        })
                        .catch(error => cb(error));
                })
                .catch(error => cb(error));
        })
    );

    const router: express.Router = express.Router();

    router.get("/", (req, res, next) => {
        const options: any = {
            state: req.query.redirect || externalAuthHome
        };
        passport.authenticate("arcgis", options)(req, res, next);
    });

    router.get(
        "/return",
        (
            req: express.Request,
            res: express.Response,
            next: express.NextFunction
        ) => {
            passport.authenticate("arcgis", {
                failWithError: true
            })(req, res, next);
        },
        (
            req: express.Request,
            res: express.Response,
            next: express.NextFunction
        ) => {
            redirectOnSuccess(req.query.state as string, req, res);
        },
        (
            err: any,
            req: express.Request,
            res: express.Response,
            next: express.NextFunction
        ): any => {
            redirectOnError(err, req.query.state as string, req, res);
        }
    );

    return router;
}
