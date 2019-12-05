import { ApiError } from "@google-cloud/common";
import { installStatusRouter } from "@magda/typescript-common/dist/express/status";
import buildJwt from "@magda/typescript-common/dist/session/buildJwt";
import * as express from "express";
import { OutgoingHttpHeaders } from "http";
import ObjectStoreClient from "./ObjectStoreClient";
import * as bodyParser from "body-parser";
import { Readable } from "stream";

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

    router.use(bodyParser.json({ type: "*/json" }));
    router.use(bodyParser.text({ type: "text/*" }));
    router.use(
        bodyParser.raw({ type: ["image/*", "application/octet-stream"] })
    );

    // Download an object
    router.get("/:recordid", async function(req, res) {
        const recordId = req.params.recordid;
        const encodedRootPath = encodeURIComponent(recordId);

        const object = options.objectStoreClient.getFile(encodedRootPath);

        let headers: OutgoingHttpHeaders;
        try {
            headers = await object.headers();
            Object.keys(headers).forEach(header => {
                const value = headers[header];
                if (value !== undefined) {
                    res.setHeader(header, value);
                }
            });
        } catch (err) {
            if (err instanceof ApiError) {
                if (err.code === 404) {
                    return res
                        .status(404)
                        .send("No such object with recordId " + recordId);
                }
            }
            return res.status(500).send("Unknown error");
        }

        const streamP = object.createStream();
        if (streamP) {
            streamP.then(stream => {
                stream.on("error", _e => {
                    res.status(500).send("Unknown error");
                });
                stream.pipe(res);
            });
        }
    });

    // Upload an object
    router.post("/:recordid", async function(req, res) {
        const recordId = req.params.recordid;
        const encodedRootPath = encodeURIComponent(recordId);
        const content = req.body;
        console.log("content: ", content);
        const metaData = {
            "Content-Type": req.headers["content-type"],
            "Content-Length": req.headers["content-length"]
        };
        return options.objectStoreClient
            .postFile(encodedRootPath, content, metaData)
            .then(etag => {
                console.log("Here is result: ", etag);
                return res.status(200).send({
                    message: "File uploaded successfully",
                    etag: etag
                });
            })
            .catch((err: Error) => {
                console.error(err);
                // Sending 500 for everything for the moment
                return res.status(500).send({
                    message:
                        "Encountered error while uploading file." +
                        "This has been logged and we are looking into this."
                });
            });
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
