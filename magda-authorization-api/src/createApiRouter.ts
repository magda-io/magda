import * as express from "express";
import { Maybe } from "tsmonad";

import Database from "./Database";
import { PublicUser } from "@magda/typescript-common/dist/authorization-api/model";
import { getUserIdHandling } from "@magda/typescript-common/dist/session/GetUserId";
import AuthError from "@magda/typescript-common/dist/authorization-api/AuthError";

export interface ApiRouterOptions {
    database: Database;
    jwtSecret: string;
}

/**
 * @apiDefine Auth Authorization API
 */

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
                    just: user => res.json(user),
                    nothing: () => res.status(404)
                })
            )
            .catch(e => {
                console.error(e);
                res.status(500);
            })
            .then(() => res.end());
    }

    router.all("/private/*", function(req, res, next) {
        //--- private API requires admin level access

        getUserIdHandling(
            req,
            res,
            options.jwtSecret,
            async (userId: string) => {
                try {
                    const user = (await database.getUser(userId)).valueOrThrow(
                        new AuthError(
                            `Cannot locate user record by id: ${userId}`,
                            401
                        )
                    );
                    if (!user.isAdmin)
                        throw new AuthError(
                            "Only admin users are authorised to access this API",
                            403
                        );
                    next();
                } catch (e) {
                    console.warn(e);
                    if (e instanceof AuthError)
                        res.status(e.statusCode).send(e.message);
                    else res.status(401).send("Not authorized");
                }
            }
        );
    });

    router.get("/private/users/lookup", function(req, res) {
        const source = req.query.source;
        const sourceId = req.query.sourceId;

        handlePromise(res, database.getUserByExternalDetails(source, sourceId));
    });

    router.get("/private/users/:userId", function(req, res) {
        const userId = req.params.userId;

        handlePromise(res, database.getUser(userId));
    });

    router.post("/private/users", async function(req, res) {
        try {
            const user = await database.createUser(req.body);
            res.json(user);
            res.status(201);
        } catch (e) {
            console.error(e);
            res.status(500);
        }
        res.end();
    });

    /**
     * @apiGroup Auth
     * @api {get} /v0/auth/users/whoami Get Current User
     * @apiDescription Returns current user
     *
     * @apiSuccessExample {any} 200
     *    {
     *        "id":"...",
     *        "displayName":"Fred Nerk",
     *        "email":"fred.nerk@data61.csiro.au",
     *        "photoURL":"...",
     *        "source":"google",
     *        "isAdmin": true
     *    }
     *
     * @apiErrorExample {json} 401
     *    Not Authorized (if not logged in).
     */

    router.get("/public/users/whoami", function(req, res) {
        getUserIdHandling(req, res, options.jwtSecret, (userId: string) =>
            handlePromise(res, database.getUser(userId))
        );
    });

    /**
     * @apiGroup Auth
     * @api {get} /v0/auth/users/:userId Get User By Id
     * @apiDescription Returns user by id
     *
     * @apiParam {string} userId id of user
     *
     * @apiSuccessExample {any} 200
     *    {
     *        "id":"...",
     *        "displayName":"Fred Nerk",
     *        "photoURL":"...",
     *        "isAdmin": true
     *    }
     *
     *
     * @apiErrorExample {json} 500
     *    Nothing
     */
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
