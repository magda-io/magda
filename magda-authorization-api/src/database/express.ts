import * as db from "./index";

import { Router } from "express";
import { createStatus } from "./status";

export interface Options {
    prefix: string;
    database: db.Database;
}

export function createAPI(options: Options): Router {
    const router = Router();
    const database = options.database;

    router.get("/all", async function(req, res, next) {
        try {
            const results = await database.all(req.query);
            res.status(200).json(results);
        } catch (err) {
            next(err);
        }
    });

    router.use("/state", createStatus({}));

    router.use(function(err: any, req: any, res: any, next: any) {
        console.error("ERROR", req.method, req.path, err.stack);
        res.status(parseInt(err && err.statusCode) || 500)
            .json({
                result: "failed"
            })
            .end();
    });

    return router;
}

export interface ProbesList {
    [id: string]: Function;
}
