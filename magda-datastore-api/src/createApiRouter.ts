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
    registryApiUrl: string;
    objectStoreClient: ObjectStoreClient;
    jwtSecret: string;
    accessCacheMaxItems: number;
    accessCacheMaxAgeMilliseconds: number;
}

export default function createApiRouter(options: ApiRouterOptions) {
    const router: express.Router = express.Router();

    const status = {
        probes: {
            registry: createServiceProbe(options.registryApiUrl),
            objectStore: options.objectStoreClient.statusProbe
        }
    };
    installStatusRouter(router, status);

    const userAccessCache = new LRU<string, boolean>({
        max: options.accessCacheMaxItems,
        maxAge: options.accessCacheMaxAgeMilliseconds
    });

    function computeCacheKey(
        tenantId: number,
        userId: string,
        recordId: string
    ) {
        return JSON.stringify([tenantId, userId, recordId]);
    }

    router.get("/:recordid/*", async function(req, res) {
        let tenantId = Number.parseInt(req.header("X-Magda-Tenant-Id"), 10);
        if (Number.isNaN(tenantId)) {
            res.status(400).send("X-Magda-Tenant-Id header is required.");
            return;
        }

        const userId = getUserId(req, options.jwtSecret).valueOr<
            string | undefined
        >(undefined);

        const recordId = req.params.recordid;

        const cacheKey = computeCacheKey(tenantId, userId, recordId);
        const userHasAccess = userAccessCache.get(cacheKey);
        if (userHasAccess === false) {
            // We previously determined this user does not have access.
            res.status(404).send(
                "File does not exist or access is unauthorized."
            );
            return;
        } else if (userHasAccess !== true) {
            // Verify that this user has access to the corresponding registry record.
            const registry =
                userId === undefined
                    ? new RegistryClient({
                          baseUrl: options.registryApiUrl,
                          tenantId: tenantId
                      })
                    : new AuthorizedRegistryClient({
                          baseUrl: options.registryApiUrl,
                          tenantId: tenantId,
                          jwtSecret: options.jwtSecret,
                          userId: userId
                      });

            const record = await registry.getRecord(recordId);

            const hasAccess =
                record && !(record instanceof Error) && record.id !== undefined;
            userAccessCache.set(cacheKey, hasAccess);

            if (!hasAccess) {
                res.status(404).send(
                    "File does not exist or access is unauthorized."
                );
                return;
            }
        }

        // This user has access to this record, so grant them access to
        // this record's files.
        const encodedRootPath = encodeURIComponent(recordId);

        const object = options.objectStoreClient.getFile(
            encodedRootPath + "/" + req.params[0]
        );

        let headers: OutgoingHttpHeaders;
        try {
            headers = await object.headers();
            Object.keys(headers).forEach(header => {
                const value = headers[header];
                if (value) {
                    res.setHeader(header, headers[header]);
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
