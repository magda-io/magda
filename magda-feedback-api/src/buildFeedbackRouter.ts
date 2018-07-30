import * as express from "express";
import * as request from "request";
import * as bodyParser from "body-parser";

export interface FeedbackRouterParams {
    trustProxy: boolean;
    shouldPostToGithub: boolean;
    gitHubPostUrl: string;
    userAgent: string;
}

export default function buildFeedbackRouter(
    params: FeedbackRouterParams
): express.Express {
    // Create a new Express application.
    var app = express();
    app.set("trust proxy", params.trustProxy);

    app.use(bodyParser.json({ type: "application/json" }));
    app.use(bodyParser.json({ type: "application/csp-report" }));

    /**
     * @apiGroup Feedback
     * @api {post} /v0/csp Report CSP Violation
     * @apiDescription TODO
     *
     * @apiParam (Request body) {string} csp-report TODO
     *
     * @apiSuccess {string} result SUCCESS
     *
     * @apiSuccessExample {json} 200
     *    {
     *         "result": "SUCCESS"
     *    }
     *
     * @apiError {string} result FAILED
     *
     * @apiErrorExample {json} 400
     *    {
     *         "result": "FAILED"
     *    }
     */
    app.post("/v0/csp", function(req, res, next) {
        var parameters = req.body;

        const body = JSON.stringify({
            title: "CSP Report",
            body: formatCspReportBody(req, parameters["csp-report"])
        });

        report(body, res, params);
    });

    /**
     * @apiGroup Feedback
     * @api {post} /v0/user Post User Feedback
     * @apiDescription TODO
     *
     * @apiParam (Request body) {string} [title] TODO
     * @apiParam (Request body) {string} [name] TODO
     * @apiParam (Request body) {string} [email] TODO
     * @apiParam (Request body) {string} [comment] TODO
     * @apiParam (Request body) {string} [shareLink] TODO
     *
     * @apiSuccess {string} result SUCCESS
     *
     * @apiSuccessExample {object} 200
     *    {
     *         "result": "SUCCESS"
     *    }
     *
     * @apiError {string} result FAILED
     *
     * @apiErrorExample {object} 400
     *    {
     *         "result": "FAILED"
     *    }
     */
    app.post("/v0/user", function(req, res, next) {
        var parameters = req.body;

        const body = JSON.stringify({
            title: parameters.title ? parameters.title : "User Feedback",
            body: formatUserFeedbackBody(req, parameters)
        });

        report(body, res, params);
    });

    return app;
}

function formatCspReportBody(request: any, parameters: any) {
    var result = "";
    result +=
        "* Document URI: " +
        (parameters["document-uri"]
            ? parameters["document-uri"]
            : "Not provided") +
        "\n";
    result +=
        "* Referrer: " +
        (parameters.referrer ? parameters.referrer : "Not provided") +
        "\n";
    result +=
        "* Blocked URI: " +
        (parameters["blocked-uri"]
            ? parameters["blocked-uri"]
            : "Not provided") +
        "\n";
    result +=
        "* Violated Directive: " +
        (parameters["violated-directive"]
            ? parameters["violated-directive"]
            : "Not provided") +
        "\n";
    result +=
        "* Original Policy: " +
        (parameters["original-policy"]
            ? parameters["original-policy"]
            : "Not provided") +
        "\n";

    return result;
}

function formatUserFeedbackBody(request: any, parameters: any) {
    var result = "";

    result += parameters.comment ? parameters.comment : "No comment provided";
    result += "\n### User details\n";
    result +=
        "* Name: " +
        (parameters.name ? parameters.name : "Not provided") +
        "\n";
    result +=
        "* Email Address: " +
        (parameters.email ? parameters.email : "Not provided") +
        "\n";
    result += "* IP Address: " + request.ip + "\n";
    result += "* User Agent: " + request.header("User-Agent") + "\n";
    result += "* Referrer: " + request.header("Referrer") + "\n";
    result +=
        "* Share URL: " +
        (parameters.shareLink ? parameters.shareLink : "Not provided") +
        "\n";

    return result;
}

function report(
    body: any,
    res: express.Response,
    params: FeedbackRouterParams
) {
    if (params.shouldPostToGithub) {
        request(
            {
                url: params.gitHubPostUrl,
                method: "POST",
                headers: {
                    "User-Agent": params.userAgent,
                    Accept: "application/vnd.github.v3+json"
                },
                body: body
            },
            function(error, response, body) {
                res.set("Content-Type", "application/json");
                if (response.statusCode < 200 || response.statusCode >= 300) {
                    res.status(response.statusCode).send(
                        JSON.stringify({ result: "FAILED" })
                    );
                } else {
                    res.status(200).send(JSON.stringify({ result: "SUCCESS" }));
                }
            }
        );
    } else {
        console.log(body);
        res.status(200).send(JSON.stringify({ result: "SUCCESS" }));
    }
}
