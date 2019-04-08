import * as express from "express";
import { Router } from "express";
import Database from "./Database";
import { User } from "@magda/typescript-common/dist/authorization-api/model";
import * as request from "request";
import * as bodyParser from "body-parser";

export interface OpaRouterOptions {
    opaUrl: string;
    database: Database;
    jwtSecret: string;
}

const opaRoutes = [
    {
        path: "/compile",
        method: "post"
    },
    {
        path: "/compile",
        method: "get"
    },
    {
        path: "/data/*",
        method: "get"
    },
    {
        path: "/data/*",
        method: "post"
    },
    {
        path: "/query",
        method: "get"
    },
    {
        path: "/query",
        method: "post"
    }
];

/**
 * 
 * @param options proxyReq: http.ClientRequest,
      req: http.IncomingMessage,
      res: http.ServerResponse,
      options: Server.ServerOptions
 */

export default function createOpaRouter(options: OpaRouterOptions): Router {
    const database = options.database;
    const router: Router = express.Router();
    const jwtSecret: string = options.jwtSecret;
    const opaUrl: string = options.opaUrl;

    router.use(bodyParser.json({ type: "application/json" }));

    async function appendUserInfoToInput(
        req: express.Request,
        res: express.Response
    ) {
        let userInfo: User;

        try {
            userInfo = await database.getCurrentUserInfo(req, jwtSecret);
        } catch (e) {
            userInfo = await database.getDefaultAnonymousUserInfo();
        }

        let reqData: any = {};
        let reqQueryParams: any = {};
        const contentType = req.get("content-type");

        // --- merge userInfo into possible income input data via POST
        if (
            typeof req.body === "object" &&
            contentType &&
            contentType.toLowerCase() === "application/json"
        ) {
            reqData = req.body;
        }

        // --- process parameters from quert string
        if (req.query && Object.keys(req.query).length) {
            const { q, input, unknowns, ...otherQueryParams } = req.query;

            if (q && typeof q === "string" && q.length) {
                reqData["query"] = q;
            }

            if (input && typeof input === "string" && input.length) {
                try {
                    const inputData = JSON.parse(input);
                    if (!reqData.input) {
                        reqData.input = inputData;
                    } else {
                        reqData.input = { ...reqData.input, ...inputData };
                    }
                } catch (e) {}
            }

            if (unknowns && typeof unknowns === "string" && unknowns.length) {
                try {
                    reqData["unknowns"] = JSON.parse(unknowns);
                } catch (e) {}
            }

            reqQueryParams = otherQueryParams;
        }

        if (!reqData.input) {
            reqData.input = {};
        }

        reqData.input.user = userInfo;

        const reqOpts: request.CoreOptions = {
            method: "post",
            json: reqData
        };

        if (Object.keys(reqQueryParams).length) {
            reqOpts.qs = reqQueryParams;
        }
        request(`${opaUrl}${req.path}`, reqOpts).pipe(res);
    }

    opaRoutes.map(route => {
        if (route.method == "post") {
            router.post(route.path, appendUserInfoToInput);
        } else {
            router.get(route.path, appendUserInfoToInput);
        }
    });

    return router;
}
