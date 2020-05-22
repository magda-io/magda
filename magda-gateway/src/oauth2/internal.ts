import express from "express";
import { Strategy as LocalStrategy } from "passport-local";
import { Authenticator } from "passport";
import pg from "pg";
import bcrypt from "bcrypt";

import { redirectOnSuccess, redirectOnError } from "./redirect";

export interface InternalAuthProviderOptions {
    dbPool: pg.Pool;
    passport: Authenticator;
    externalAuthHome: string;
}

export default function internal(options: InternalAuthProviderOptions) {
    const passport = options.passport;
    const externalAuthHome = options.externalAuthHome;
    const db = options.dbPool;

    passport.use(
        "magda-internal",
        new LocalStrategy(
            async (
                username: string,
                password: string,
                done: (error: any, user?: any, info?: any) => void
            ) => {
                try {
                    if (typeof username !== "string" || !username.length) {
                        throw new Error("username cannot be empty!");
                    }
                    const result = await db.query(
                        `SELECT "u"."id" as "user_id", "c"."hash" as "hash"
                    FROM "users" "u"
                    LEFT JOIN "credentials" "c" ON "c"."user_id" = "u"."id"
                    WHERE "u"."email"=$1 AND "u"."source"='internal'
                    LIMIT 1`,
                        [username]
                    );
                    if (!result || !result.rows || !result.rows.length) {
                        console.log(
                            `Failed to authenticate user ${username}: cannot locate user record`
                        );
                        done(null, false);
                        return;
                    }
                    const user_id = result.rows[0].user_id;
                    const hash = result.rows[0].hash;
                    const match = await bcrypt.compare(password, hash);
                    if (match) {
                        done(null, {
                            id: user_id
                        });
                    } else {
                        console.log(
                            `Failed to authenticate user ${username}: incorrect password`
                        );
                        done(null, false);
                        return;
                    }
                } catch (e) {
                    console.error(
                        `Error when authenticate user ${username}: ${e}`
                    );
                    done(
                        new Error(
                            "Failed to verify your credentials due to a system error."
                        )
                    );
                }
            }
        )
    );

    const router: express.Router = express.Router();

    router.post(
        "/",
        (
            req: express.Request,
            res: express.Response,
            next: express.NextFunction
        ) => {
            passport.authenticate("magda-internal", {
                failWithError: true
            })(req, res, next);
        },
        (
            req: express.Request,
            res: express.Response,
            next: express.NextFunction
        ) => {
            redirectOnSuccess(
                (req.query.redirect as string) || externalAuthHome,
                req,
                res
            );
        },
        (
            err: any,
            req: express.Request,
            res: express.Response,
            next: express.NextFunction
        ): any => {
            redirectOnError(
                err,
                (req.query.redirect as string) || externalAuthHome,
                req,
                res
            );
        }
    );

    return router;
}
