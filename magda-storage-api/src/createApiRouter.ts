import { ApiError } from "@google-cloud/common";
import express from "express";
import { OutgoingHttpHeaders } from "http";
import ObjectStoreClient from "./ObjectStoreClient";
import bodyParser from "body-parser";

export interface ApiRouterOptions {
    objectStoreClient: ObjectStoreClient;
}

export default function createApiRouter(options: ApiRouterOptions) {
    const router: express.Router = express.Router();

    // JSON files are interpreted as text
    router.use(bodyParser.text({ type: ["text/*", "application/json"] }));
    router.use(
        bodyParser.raw({ type: ["image/*", "application/octet-stream"] })
    );

    // Liveness probe
    router.get("/status/live", function(_req, res) {
        return res.status(200).send("OK");
    });

    // Readiness probe
    router.get("/status/ready", function(_req, res) {
        return res.status(200).send("OK");
    });

    // Download an object
    router.get("/:bucket/:fileid", async function(req, res) {
        const fileId = req.params.fileid;
        const bucket = req.params.bucket;
        const encodedFilename = encodeURIComponent(fileId);
        const encodeBucketname = encodeURIComponent(bucket);

        const object = options.objectStoreClient.getFile(
            encodeBucketname,
            encodedFilename
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
        } catch (err) {
            if (err instanceof ApiError) {
                if (err.code === 404) {
                    res.status(404).send(
                        "No such object with fileId " +
                            fileId +
                            " in bucket " +
                            bucket
                    );
                }
            }
            res.status(500).send("Unknown error");
        }

        const stream = await object.createStream();
        if (stream) {
            stream.on("error", _e => {
                res.status(500).send("Unknown error");
            });
            stream.pipe(res);
        }
    });

    // Upload an object
    router.put("/:bucket/:fileid", async function(req, res) {
        const fileId = req.params.fileid;
        const bucket = req.params.bucket;
        const encodedRootPath = encodeURIComponent(fileId);
        const encodeBucketname = encodeURIComponent(bucket);
        const content = req.body;
        const metaData = {
            "Content-Type": req.headers["content-type"],
            "Content-Length": req.headers["content-length"]
        };
        return options.objectStoreClient
            .putFile(encodeBucketname, encodedRootPath, content, metaData)
            .then(etag => {
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
                        "Encountered error while uploading file. " +
                        "This has been logged and we are looking into this."
                });
            });
    });

    // Remove/Delete an object
    router.delete("/:bucket/:fileid", async function(req, res) {
        const fileId = req.params.fileid;
        const bucket = req.params.bucket;
        const encodedRootPath = encodeURIComponent(fileId);
        const encodeBucketname = encodeURIComponent(bucket);
        const deletionSuccess = await options.objectStoreClient.deleteFile(
            encodeBucketname,
            encodedRootPath
        );
        console.log("deletionSuccess: ", deletionSuccess);
        if (deletionSuccess) {
            return res.status(200).send({
                message: "File deleted successfully"
            });
        }
        return res.status(500).send({
            message:
                "Encountered error while deleting file." +
                "This has been logged and we are looking into this."
        });
    });

    return router;
}
