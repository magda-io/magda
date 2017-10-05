import * as express from "express";
import { Maybe } from "tsmonad";

import Database from "./Database";
import { PublicUser } from "@magda/typescript-common/dist/authorization-api/model";
import { getUserIdHandling } from "@magda/typescript-common/dist/session/GetUserId";

export interface ApiRouterOptions {
    database: Database;
    jwtSecret: string;
}

export default function createApiRouter(options: ApiRouterOptions) {
    const database = options.database;

    const router: express.Router = express.Router();

    function handlePromise<T>(
        res: express.Response,
        promise: Promise<Maybe<T>>
    ) {
        return promise
            .then(user =>
                user.caseOf({
                    just: user => Promise.resolve(res.json(user)),
                    nothing: () => Promise.resolve(res.status(404))
                })
            )
            .catch(e => {
                console.error(e);
                res.status(500);
            })
            .then(() => res.send());
    }

    router.get("/private/users/lookup", function(req, res) {
        const source = req.query.source;
        const sourceId = req.query.sourceId;

        handlePromise(res, database.getUserByExternalDetails(source, sourceId));
    });

    router.get("/private/users/:userId", function(req, res) {
        const userId = req.params.userId;

        handlePromise(res, database.getUser(userId));
    });

    router.post("/private/users", function(req, res) {
        database
            .createUser(req.body)
            .then(user => {
                res.json(user);
                res.status(201);
            })
            .catch(e => {
                console.error(e);
                res.status(500);
            })
            .then(() => res.send());
    });

    router.get("/public/users/whoami", function(req, res) {
        getUserIdHandling(req, res, options.jwtSecret, (userId: string) =>
            handlePromise(res, database.getUser(userId))
        );
    });

    router.get("/public/users/:userId", (req, res) => {
        const userId = req.params.userId;

        const getPublicUser = database.getUser(userId).then(userMaybe =>
            userMaybe.map(user => {
                const publicUser: PublicUser = {
                    id: user.id,
                    photoURL: user.photoURL,
                    displayName: user.displayName,
                    isAdmin: user.isAdmin
                };

                return publicUser;
            })
        );

        handlePromise(res, getPublicUser);
    });

    // This is for getting a JWT in development so you can do fake authenticated requests to a local server.
    if (process.env.NODE_ENV !== "production") {
        router.get("public/jwt", function(req, res) {
            res.status(200);
            res.write("X-Magda-Session: " + req.header("X-Magda-Session"));
            res.send();
        });
    }

    return router;
}
