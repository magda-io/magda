# @magda/apidocs-server

The microservice that serves MAGDA's **in-browser API documentation**.

The docs are auto-generated from [apidocjs](https://apidocjs.com/)-format
comments embedded in the source of every `magda-*` component, then served as a
static site. You can view them:

- On a deployed cluster at `/api/v0/apidocs/index.html`.
- On the GitHub Pages mirror at https://magda-io.github.io/api-docs (published
  from `main` — see [Serving & publishing](#serving--publishing) below).

> This README covers **how the docs are generated and served**. For **how to
> write** the apidoc comments in your component's source, see
> [`docs/docs/api-documentation-howto.md`](../docs/docs/api-documentation-howto.md).

## Where the docs come from

Nothing is authored in this component. The content is the set of apidocjs
comment blocks embedded next to the endpoint handlers in each `magda-*`
component (Scala, TypeScript and JavaScript source). This component only
**collects** those comments and renders them.

## How the docs are generated

`yarn build` runs the `build` script in `package.json`:

```
generate-api-documentation --config ./apidoc.json --output ./build
```

`generate-api-documentation` is [`scripts/generate-api-documentation.js`](../scripts/generate-api-documentation.js)
(from the `@magda/scripts` package). It:

1. Scans the repo root for sibling folders matching `^magda-.*$` and, for each
   one that has a `src` directory, adds `<component>/src` as an apidoc input.
2. Runs apidoc across those inputs, restricted to `.scala`, `.ts` and `.js`
   files, with `--private true` (so `@apiPrivate` endpoints are included):

   ```
   apidoc --debug --private true \
     -i <each magda-*/src> \
     -f ".*\.scala$" -f ".*\.ts$" -f ".*\.js$" \
     -o ./build -c ./apidoc.json
   ```

   This writes the apidoc single-page app (`index.html` + assets) plus the
   intermediate `api_project.json` / `api_data.json` into `./build`.
3. Converts that apidoc output into OpenAPI/Swagger specs, writing
   `build/swagger.json` (Swagger 2.0) and `build/openapi.json` (OpenAPI 3.0.1).

`apidoc.json` in this folder supplies the project-level `name`, `title`,
`description`, `url` and footer used across all three outputs.

### Forked apidoc

The build uses a **fork** of apidoc, not the upstream npm package. It is pinned
in [`scripts/package.json`](../scripts/package.json):

```json
"apidoc": "https://github.com/magda-io/apidoc"
```

Keep this in mind when debugging generation behaviour or upgrading — upstream
apidoc releases do not necessarily apply.

## How comments map to the rendered output

- `@apiGroup <Name>` controls **which sidebar section** an endpoint appears
  under in the SPA, and becomes the **`tag`** on the endpoint in the generated
  `swagger.json` / `openapi.json`. If an endpoint shows up in an unexpected
  section, its `@apiGroup` is the first thing to check.
- `@api {method} /path Title` defines the endpoint entry (HTTP method, path and
  the title shown in the list).
- Request parameters are split between query and request body by the
  **`@apiParam` group label**: a group name containing `body` (e.g.
  `@apiParam (body) ...`) is emitted into the request body of the generated
  spec; every other group becomes a query parameter. See the
  [param-group convention](../docs/docs/api-documentation-howto.md) in the
  how-to for the recommended labels.

## Build & preview locally

```bash
# from the repo root
yarn install

cd magda-apidocs-server
yarn build

# then open ./build/index.html in a browser
```

The generated `build/` folder contains everything served: the apidoc SPA plus
`swagger.json` and `openapi.json`.

## Serving & publishing

- **On a deployed cluster:** the Docker image (`Dockerfile`) is `nginx:alpine`
  with `default.conf` and the generated `build/` copied in; nginx serves the
  static site (health/readiness probes at `/healthz`, `/status/live`,
  `/status/ready`). It is reachable through the gateway at
  `/api/v0/apidocs/index.html`.
- **GitHub Pages mirror:** the
  [`Deploy Latest API Docs`](../.github/workflows/deploy-api-docs-main.yaml)
  workflow runs on every push to `main`. It runs `yarn build`, swaps in
  `doc-repo-readme.md` as the published `README.md`, and pushes the `build/`
  folder to the [`magda-io/api-docs`](https://github.com/magda-io/api-docs)
  repository, which GitHub Pages serves at
  https://magda-io.github.io/api-docs.

## Generated artifacts (`./build`)

| File | Description |
| --- | --- |
| `index.html` (+ assets) | The apidoc single-page documentation site. |
| `swagger.json` | Swagger 2.0 spec generated from the apidoc data. |
| `openapi.json` | OpenAPI 3.0.1 spec generated from the apidoc data. |

## See also

- [How to document APIs](../docs/docs/api-documentation-howto.md) — the apidoc
  comment format and conventions (how to author the docs this component renders).
