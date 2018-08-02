# How to keep API documented

For this project, a tool called apidocjs is being used for API documentation.
With this package, API documentation is maintained along with implementation
in source code.
This tool and additional scripts are then used to generate api HTML
documentation and also swagger/openapi specification files.

Please document apis like the following:

<pre>

/**
 * @apiGroup Feedback
 * @api {get} /v0/healthz Health Check
 * @apiDescription TODO
 * @apiSuccessExample {string} 200
 *    OK
 */
app.get("/v0/healthz", function(req, res, next) {
    res.status(200).send("OK");
});

</pre>

<pre>

/**
 * @apiGroup Feedback
 * @api {post} /v0/user Post User Feedback
 * @apiDescription TODO
 *
 * @apiParam (Request body) {string} [title] TODO
 * @apiParam (Request body) {string} [name] TODO
 * @apiParam (Request body) {string} [email] TODO
 * @apiParam (Request body) {string} comment TODO
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
    ...

</pre>
