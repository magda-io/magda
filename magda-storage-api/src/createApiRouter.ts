import { ApiError } from "@google-cloud/common";
import {
    createServiceProbe,
    installStatusRouter
} from "@magda/typescript-common/dist/express/status";
import AuthorizedRegistryClient from "@magda/typescript-common/dist/registry/AuthorizedRegistryClient";
import RegistryClient from "@magda/typescript-common/dist/registry/RegistryClient";
import buildJwt from "@magda/typescript-common/dist/session/buildJwt";
import { getUserId } from "@magda/typescript-common/dist/session/GetUserId";
import * as express from "express";
import { OutgoingHttpHeaders } from "http";
import * as LRU from "lru-cache";
import ObjectStoreClient from "./ObjectStoreClient";

export interface ApiRouterOptions {
    objectStoreClient: ObjectStoreClient;
    jwtSecret: string;
    accessCacheMaxItems: number;
    accessCacheMaxAgeMilliseconds: number;
}

export default function createApiRouter(options: ApiRouterOptions) {
    const router: express.Router = express.Router();

    const status = {
        probes: {
            objectStore: options.objectStoreClient.statusProbe
        }
    };
    installStatusRouter(router, status);

    router.get("/:recordid/*", async function(req, res) {
        const recordId = req.params.recordid;
        const encodedRootPath = encodeURIComponent(recordId);

        const object = options.objectStoreClient.getFile(
            encodedRootPath + "/" + req.params[0]
        );

        let headers: OutgoingHttpHeaders;
        try {
            headers = await object.headers();
            Object.keys(headers).forEach(header => {
                const value = headers[header];
                if (value !== undefined) {
                    res.setHeader(header, value);
                }
            });
        } catch (e) {
            if (e instanceof ApiError) {
                if (e.code === 404) {
                    res.status(404).send(
                        "No such object for record ID " +
                            recordId +
                            ": " +
                            req.params[0]
                    );
                    return;
                }
            }
            res.status(500).send("Unknown error");
            return;
        }

        const stream = object.createStream();
        stream.on("error", e => {
            res.status(500).send("Unknown error");
        });

        stream.pipe(res);
    });

    // This is for getting a JWT in development so you can do fake authenticated requests to a local server.
    if (process.env.NODE_ENV !== "production") {
        router.get("/public/jwt", function(req, res) {
            res.status(200);
            res.write(
                "X-Magda-Session: " +
                    buildJwt(
                        options.jwtSecret,
                        "00000000-0000-4000-8000-000000000000"
                    )
            );
            res.send();
        });
    }

    return router;
}
