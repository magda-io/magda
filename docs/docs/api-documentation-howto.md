# How to document APIs

For this project, a tool called [apidocjs](https://apidocjs.com/) is used for API
documentation. API documentation is maintained **alongside the implementation**,
as comment blocks in the source code. Those comments are then collected and
rendered into the in-browser API docs (and into `swagger.json` / `openapi.json`)
by the `magda-apidocs-server` component.

> This page covers **how to write** the apidoc comments. For how the docs are
> **generated and served** (the build pipeline, the forked apidoc, nginx serving,
> and the GitHub Pages publish), see
> [`magda-apidocs-server/README.md`](../../magda-apidocs-server/README.md).

## Examples

A simple `GET` endpoint:

<pre>

/**
 * @apiGroup Feedback
 * @api {get} /v0/healthz Health Check
 * @apiDescription Returns 200 OK when the service is healthy. Used by
 *    Kubernetes liveness/readiness probes.
 * @apiSuccessExample {string} 200
 *    OK
 */
app.get("/v0/healthz", function(req, res, next) {
    res.status(200).send("OK");
});

</pre>

A `POST` endpoint with a request body, success and error responses:

<pre>

/**
 * @apiGroup Feedback
 * @api {post} /v0/user Post User Feedback
 * @apiDescription Submits a user feedback item.
 *
 * @apiParam (body) {string} [title] Optional short title for the feedback.
 * @apiParam (body) {string} [name] Optional name of the person submitting.
 * @apiParam (body) {string} [email] Optional contact email.
 * @apiParam (body) {string} comment The feedback text (required).
 * @apiParam (body) {string} [shareLink] Optional link to the page being reported.
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

## Annotation reference

These are the apidoc annotations commonly used across the `magda-*` components:

| Annotation | Purpose |
| --- | --- |
| `@apiGroup <Name>` | The sidebar section the endpoint appears under (and the `tag` in the generated swagger/openapi). Keep the name stable — grouping is purely by this string. |
| `@api {method} /path Title` | Declares the endpoint: HTTP method, path, and the title shown in the list. Required for a block to be treated as an endpoint. |
| `@apiName <Name>` | A unique name for the endpoint (used by apidoc for versioning/diffing). |
| `@apiDescription <text>` | Longer description shown in the endpoint detail. |
| `@apiParam (<group>) {type} [field] description` | A request parameter. The `(<group>)` label decides where it goes — see [Param groups](#param-groups) below. Wrap a `field` in `[...]` to mark it optional. |
| `@apiParamExample {type} <title>` | An example request payload. |
| `@apiHeader {type} <name>` | A request header (e.g. `X-Magda-Session`, `X-Magda-Tenant-Id`). |
| `@apiSuccess {type} field description` | A field returned on success. |
| `@apiSuccessExample {type} <title>` | An example success response body. |
| `@apiError {type} field description` | A field returned on error. |
| `@apiErrorExample {type} <title>` | An example error response body. |
| `@apiUse <Name>` | Includes a reusable block defined with `@apiDefine` — see [Reusable blocks](#reusable-blocks). |
| `@apiDefine <Name>` | Defines a reusable block (of params, errors, etc.) to be pulled in with `@apiUse`. |
| `@apiDeprecated [text]` | Marks the endpoint as deprecated. |
| `@apiPrivate` | Marks the endpoint as private. The build runs with `--private true`, so private endpoints **are** included in Magda's generated docs. |

## Param groups

The `(<group>)` label on `@apiParam` is significant. When the apidoc output is
converted to `swagger.json` / `openapi.json`, a parameter is placed into the
**request body** when its group name contains the word `body`
(case-insensitive); otherwise it is emitted as a **query parameter**.

To keep the generated specs correct and consistent, prefer these group labels:

- `(path)` — path/URL parameters.
- `(query)` — query-string parameters.
- `(body)` — request-body fields.

> Because body-vs-query is decided purely by matching `body` in the group name,
> an inconsistent label (e.g. putting a body field under `(Request Body JSON)`
> works, but a path param under a label containing `body` would wrongly land in
> the request body). Sticking to `(path)` / `(query)` / `(body)` avoids surprises.
> Note that path parameters are currently emitted as query parameters in the
> generated spec — a known limitation of the converter.

## Reusable blocks

Repeated content (typically a common error response) is defined once with
`@apiDefine` and pulled into each endpoint with `@apiUse`. The most common one is
`GenericError`, defined once per component and referenced from most endpoints:

<pre>

/**
 * @apiDefine GenericError
 * @apiError (Error 500) {string} response Something went wrong.
 * @apiErrorExample {json} 500
 *    { "isError": true, "errorCode": 500, "errorMessage": "..." }
 */

/**
 * @apiGroup Registry Record Service
 * @api {get} /v0/registry/records Get a list of records
 * ...
 * @apiUse GenericError
 */

</pre>

## See also

- [`magda-apidocs-server/README.md`](../../magda-apidocs-server/README.md) — how
  the API docs are generated (the forked apidoc, the scan of every `magda-*/src`)
  and served (deployed cluster + GitHub Pages mirror).
