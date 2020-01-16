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

    /**
     * @apiDefine Storage Storage API
     */

    /**
     * @apiGroup Storage
     *
     * @api {get} /v0/{bucket}/{fieldid} Request to download an object in {bucket} with name {fieldid}
     *
     * @apiDescription Downloads an object
     *
     * @apiParam (Request body) {string} bucket The name of the bucket under which the requested object is
     * @apiParam (Request body) {string} fieldid The name of the object being requested
     *
     * @apiSuccessExample {binary} 200
     *      <Contents of a file>
     *
     * @apiErrorExample {text} 404
     *      "No such object with fileId {fileid} in bucket {bucket}"
     *
     * @apiErrorExample {text} 500
     *      "Unknown error"
     */
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
            if (err.code === "NotFound") {
                res.status(404).send(
                    "No such object with fileId " +
                        fileId +
                        " in bucket " +
                        bucket
                );
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

    /**
     * @apiGroup Storage
     *
     * @api {put} /v0/{bucket}/{fieldid} Request to upload an object to {bucket} with name {fieldid}
     *
     * @apiDescription Uploads an object
     *
     * @apiParam (Request body) {string} bucket The name of the bucket to which to upload to
     * @apiParam (Request body) {string} fieldid The name of the object being uploaded
     *
     * @apiSuccessExample {json} 200
     *    {
     *        "message":"File uploaded successfully",
     *        "etag":"edd88378a7900bf663a5fa386396b585-1"
     *    }
     *
     * @apiErrorExample {json} 500
     *    {
     *        "message":"Encountered error while uploading file. This has been logged and we are looking into this."
     *    }
     */
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

    /**
     * @apiGroup Storage
     *
     * @api {delete} /v0/{bucket}/{fieldid} Request to delete an object at {bucket} with name {fieldid}
     *
     * @apiDescription Deletes an object. This is a hard delete, and cannot be undone.
     * Note that if the {fieldid} does not exist, the request will not fail.
     *
     * @apiParam (Request body) {string} bucket The name of the bucket where the object resides
     * @apiParam (Request body) {string} fieldid The name of the object to be deleted
     *
     * @apiSuccessExample {json} 200
     *    {
     *        "message":"File deleted successfully",
     *    }
     *
     * @apiErrorExample {json} 500
     *    {
     *        "message": "Encountered error while deleting file. This has been logged and we are looking into this."
     *    }
     */
    router.delete("/:bucket/:fileid", async function(req, res) {
        const fileId = req.params.fileid;
        const bucket = req.params.bucket;
        const encodedRootPath = encodeURIComponent(fileId);
        const encodeBucketname = encodeURIComponent(bucket);
        const deletionSuccess = await options.objectStoreClient.deleteFile(
            encodeBucketname,
            encodedRootPath
        );
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
