# CHANGELOG

## v2.0.2

- Use global state instead in ValidateUser
- Periodically refresh login status (Interval configurable via web-server helm chart)
- Allow setting landingPage uri for anonymousUser and authenticatedUser
- Logout action will redirect user to LandingPage

## v2.0.1

- #3397 Only allow users to edit datasets that are created by Magda
- #3398 Allow the "auto-fetch metadata" button to be turned off via Helm Config
- Improved login redirection logic & UI access validation logic
- Made legacy admin home only available to admin role users
- Fixed orgUnit setting UI section request incorrect operationUri
- Replaced "magda" keyword with language var or more generic term
- Updated the default footer copyright data61 logo
- Upgraded connect-pg-simple to 6.2.1

## v2.0.0

- #3231 Upgraded to Open Policy Agent v0.33.x
- #3253 Add New /auth/opa/decision Endpoint
- move pre-defined role ids into a single contants file in magda-typescript-common
- related #3250: Rewrote the OPA AST parser for better evaluation & reference handling
- related #3250: Added common policy entry point: entrypoint/allow.rego
- #3303 rename `dataset-access-control` aspect to `access-control` aspect
- #3256 Unified policy for secure both registry records & Elasticsearch datasets
- #3304 Implement authorisation enforcement for all registry API services according to the more generic auth model defined in #3256
- #3306 Added admin web UI for auth management
- Added new APIs for managing auth objects
- #3308 Policy enforcement on auth objects APIs
- Add `records/:id/aspects` & `records/:id/aspects/count` APIs to registry
- related #3250: Rewrite decision enforcement logic for search API
- #3326 Build OPA docker image with builtin policies & Run OPA as a side car
- #3330 Fine-tune Metadata creation tool workflow for the new auth model
- #3332 Policy Enforcement on Storage API using new auth model
- #3333 Rename access-control aspect orgUnitOwnerId field to orgUnitId
- #3335 Reshape Storage API (in progress)
- #3340 OPA AST parser takes too long to evaluate large response
- Increase registry default request timeout to 60s (from 30s)
- Bump Dataset index version to 49 & publishers index version to 7
- Fixed registry API generated ts client patchRecord API response type
- add `allowAutoCrawlOnStartingUp` option to indexer
- add `/v0/status/live` & `/v0/status/ready` endpoint to indexer
- Related to #3315, introduce `ServiceRunner` to launch an integrated test & dev environment
- #3315 rewrite auth related integration tests and execute tests using `ServiceRunner` rather than mini k8s cluster `kind`
- #3345 Add dataset index / delete by ID API endpoints to indexer
- Add `debug` switch to registry API, search API & Auth API
- Related to #3331, remove any logic related to obsolete `authnReadPolicyId` record field
- Related to #3331, remove obsolete policy files `object/registry/*`
- Added APIs for managing API keys
- #3345 Add adhoc dataset indexing APIs, secure with new auth model and expose via Gateway with other indexer APIs
- "My dataset section": Add Dataset deletion function & performance improvement
- Fixed: helm chart version update script incorrectly skip updating dependencies version when `versionUpdateExclude` config in package.json is empty
- Fixed: incorrect scss-compiler-config data might be generated if non-default docker image config is used.
- #3360: Recategorize auth object related API docs & more auth object related APIs for convenient of future UI development.
- Fixed: `set-scss-vars` script will use proper imagePullSecrets to generate the UI CSS update job
- Allow the `no cache` behaviour of `whoami` & `getUserById` api to be turned off
- #3269 Backend support for Access Group
- #3366 New Registry API capability: new filter operator, merge mode, group operations and more
- Add `target` & `rel` fields to footer link item schema
- Make sure dataset creation tool always create `dcat-dataset-strings` aspect for draft datasets
- Add `reversePageTokenOrder` parameter to registry APIs `GET /records`, `GET /records/summary` & `GET /records/:recordId/history`
- #3163 Fixed Registry history API incorrectly reports more event available on the last page
- #3383 Registry get records API didn't group aspectOrQuery correctly
- Upgrade to Node 14
- Upgrade bcrypt to 5.0.1
- Fixed auth policy: make sure datasets without `publishing` aspect will be considered published
- #3348 secure openfaas gateway with new auth model & update API docs
- #3317 Use multi-stage builds to build magda-scss-compile
- #3337 Release docker images & helm charts to Github container registry as well
- #3349 secure content API with new auth model
- #3350 secure admin API (managing connectors) with new auth model
- #3351 Secure tenant API with new auth model
- Related to #3331, remove legacy middlewares
- #3352 Remove usage of MUST_BE_ADMIN middleware in auth API
- #3380 Support Graceful Pod Shutdown
- Upgrade to typescript 4.2.4 & api-extractor 7.15.2
- Upgrade react-scripts to 4.0.3 & craco to 6.4.5
- Make region index initial creation execute in the background without blocking indexer
- #3343 Consolidate admin/settings UI functionalities
- #3395 Allow users to change the publishing status of published dataset
- Fixed metadata creation tool / editor cache handling issue & workflow improvements.

## 1.3.1

- #3367 Fixed Content API header item schema target field type
- #3369 Content API Get by id API didn't response content in correct mime type
- #3371 Content API Get by id API generate one more unnecessary DB query
- #3363: Update postgres helm chart repo url
- Upgrade openfaas helm chart to 5.5.5-magda.2 to be compatible with k8s 1.22
- #3362 explicitly mark pods using emptyDir as safe to evict for cluster-autoscaler
- minion SDK: allow crawlerRecordFetchNumber to be changed via runtime config e.g. env var
- Use format-minion v1.1.2

## 1.3.0

- Upgrade nodemailer to 6.7.3
- Upgrade urijs to 1.19.11 and @types/urijs to 1.19.19
- #3020 Remove all legacy auth provider from gateway and convert them into auth plugins in separate repos
- Add `authPluginAllowedExternalRedirectDomains` support to auth plugin spec & rewrite relevant packages
- Redirect users to login page with proper error message, when they try to access the admin pages that they don't have permissions.
- #3363: Update postgres helm chart repo url

## 1.2.1

- Upgrade magda-csw-connector to v1.1.1 for [license extraction issue on certain sources](https://github.com/magda-io/magda-csw-connector/issues/21)
- #3316 Upgrade node based service docker images to node 12
- #3318 Remove openlayers from dependencies list
- #3319 Upgrade kramdown to 2.3.1
- #3320 Upgrade djv to 2.1.4
- #3321 upgrade lodash to 4.17.21
- #3126 Remove Hardcoded "postgres" username from Content DB migration script
- #3233 use networking.k8s.io/v1 for default Ingress chart

## 1.2.0

- #3291 Remove log4j from scala codebase dependency list
- #3299 Add terria aspect when posting message if dataset format is "wms".
- #3293 Upgrade elasticsearch to 6.8.22
- Upgrade logback to 1.2.10
- #3294 Indexer will auto-fixes non-topologically closed Polygons / MultiPolygons
- Crawler will now wait for 3 seconds (used to be 1 second) before perform trim action to avoid timeout issue
- Refactor Indexer code to remove the redundant index queue
- Allow overiding publisher / format indice version number for search API
- #3301 Overide "LIQ NUM" & "REG AUD NUM" to category column type in Chart Preview
- General home tiles & background visual improvements.

## 1.1.0

- #3246 Upgrade default cloudSql proxy version to v1.26.0
- #3242 Allow default bucket names to be configured in `storage-api` & `web-server` charts
- #3243 Stop creating the unused bucket `magda-bucket` on startup
- #3262 Make magda's docker building scripts (@magda/docker-utils) support multi-arch build
- #3263 Build Multi-Arch (`linux/amd64` & `linux/arm64`) Docker Images in CI (Except `magda-postgres` & `magda-elasticsearch`)
- Related to #3263, Build Multi-Arch (`linux/amd64` & `linux/arm64`) Docker Image for `magda-elasticsearch` as well.
- Related to #3263, adjusted helm chart for elasticsearch to make it run properly on linux/arm64 platform.
- #3251 Fixed akka HTTP client POST request racing conditions
- Registry-api, search API & indexer are now listen at non 80 port as they now run as non-root user in docker containers. Corresponding k8s svcs are still exposing services at 80 port.
- Upgrade sbt to 1.4.9 to fix compatibility issues with apple m1 users
- Fix: correct db backup job default schedule to `0 15 * * 6`
- #3205: improve column type prediction logic & fixes the problem where visualisation / chart incorrectly put numeric columns to X
- #3273 Fixed: when fetch data failed for preview chart, there should be proper error message shown to users
- Fix TerriaJS sharing for data preview maps (See: https://github.com/TerriaJS/nationalmap/issues/1099)
- #3232: fixed base backup made by wal-g remotely might miss files
- #3192: Use use apiextensions.k8s.io/v1 for CRDs; Update all faas function charts
- Upgraded both [CSW](https://github.com/magda-io/magda-csw-connector) & [project open data](https://github.com/magda-io/magda-project-open-data-connector) connector to v1.1.0
- #3283 mitigate log4j DOS (denial of service) Vulnerability CVE-2021-45046
- #3285 Set default Google Cloud SQL proxy version to 1.11 (Seems 1.11 is more stable on high load. If prefer higher version, user can manually set image version via Helm chart config)

## 1.0.1

- Mitigate log4j Vulnerability (CVE-2021-44228) by upgrading to 2.15.0 and set `LOG4J_FORMAT_MSG_NO_LOOKUPS` environment variable to `true`

## 1.0.0

- #3197 Minion SDK: Make minion proactive crawling records number configurable
- #3208 rewritten Web Hook related API docs
- #3123 Upgraded to PosgreSQL 13
- #3213 SQL Compatibility adjustments for PosgreSQL 13
- #3212 Migrate backup / recovery solution to wal-g
- #3207 Auto-create db password secrets (backwards-compatible change)
- #3215 Auto-create jwtSecret & Session Secret when not exists (backwards-compatible change)
- #3216 Auto-create storage-secrets when not exists #3216 (backwards-compatible change)
- #3221 Make correspondence-api turned off by default
- #3223 "Open in NationalMap" button will send data with the version field
- #3226 Release `magda-common` library Helm Chart to Share Common Deployment Logic with Plugin Developers
- #3125 Skip previously run database migration scripts
- remove magda-auth-ckan from default CD deployment
- Related to #3229, implement docker image related templates
- Related to #3229, add `magdaModuleType: "core"` to all core chart annotation
- Related to #3229, internal charts use magda-common to handle docker image related logic
- #3236 Fix VACUUM statement syntax for postgreSQL 13
- #3237 Fix CloudSQL Chart incorrect set replicas when autoscaler is enabled
- #3234 use scheduling.k8s.io/v1 for PriorityClass
- Related to #3229, upgrade `connectors` to use magda-common to handle docker image related logic
- Related to #3229, upgrade `magda-preview-map` to use magda-common to handle docker image related logic
- Related to #3229, upgrade `minions` to use magda-common to handle docker image related logic
- Make migrator jobs backoff limit configurable
- Turn off TerriaJs V7 support in CI dev site deployment

## 0.0.60

- Updated dataset pages and Ask A Question options for datasets with no contact points
- Updated Suggest A Dataset form
- Set `CRYPTOGRAPHY_DONT_BUILD_RUST` in CI to fix the docker-compose installation issue
- Fixed #1774 #2736 use non-default service account for admin-api & allow admin-api to be deployed at different namespace rather than "default"
- Fixed #3073 Frontend can't handle invalid `dataset-publisher` aspect data and trigger a blank screen
- Fixed #3080 remove `--acl public-read` in CI as cloudfront has been setup for public read only access
- Upgraded JDK in base scala docker image
- Removed exclamation point in successHeader message for Ask A Question
- Fixed #3088: Gateway liveness probe response 301 when `enableHttpsRedirection` is on (Since v0.0.59)
- #3098 Add CralwerViewRouter to web-server to serve HTML static version of dataset & distribution page for recognised crawler
- Change the way of encoding web-server configMap json to avoid potential invalid JSON
- Make web-server deployment auto-roll when configMap data changes
- Pass `defaultTimeZone` & `image` config data to frontend for future usage
- web-server module will auto add tailing slash to incoming `baseExternalUrl` config value
- Upgrade caniuse-lite
- Move markdownToHtml to typescript common module so it's shared among web-client and other modules
- #3099 Ability to supply external react components to replace built-in UI components of magda-web-client
- #3071 Metadata authoring tool allows adding distributions / files without providing a data file
- Added `www.google-analytics.com` to the default CSP allowed list
- Metadata authoring tool:Fixed: avoid sending invalid char (e.g. '\n') to vocabulary APIs
- Metadata authoring tool: Will save format string as uppercase string
- Metadata authoring tool: Fixed an issue that "No License" value was incorrect set
- #3105 Make `scssVars` option for content-api helm chart accept dictionary rather than JSON string
- #3106 Set default value of `enableMultiTenants` to `false` for `magda-core` chart
- #3107 Set gateway chart `enableAuthEndpoint` option default value to `true`
- #3094 Make openfaas a dependecy of magda chart instead of magda-core
- #3111 Make SVG icons load via inline React Components rather than `<img/>`
- #3113 Fixed "Suggest a Dataset Form" Styling Issue
- #3115 Hide Home Page "My Datasets" Section when `cataloguing` = `false`
- #3117 Auto passing web-client config obj to external plugin components
- #3119 Make key redux actions & react-router available to external plugin components
- #3124 Add AWS RDS support to Helm Charts
- #3128 Create API key utils should report an error when no switch is provided rather then assumes `-c` switch
- #3129 Auth plugin SDK getAbsoluteUrl function should check the type of the baseUrl parameter
- More visual adjustment to the discourse integration
- Use [helm-docs v1.5.0](https://github.com/norwoodj/helm-docs/releases/tag/v1.5.0) in CI
- Related to #2925: Gateway deployment will auto roll on config map changes
- #3137 Allow UI Home Page Link URL to be configurable
- #3139 Make Open in National Map button Functionality Configurable & Compatible with both v7 & v8
- #3140 Ability to supply external CSS files to magda-web-client via Config
- #3138 Allow Edit Dataset Button to be replaced by External UI Plugins
- #3136 Added auth plugin customised logout process support to Gateway
- #3145 Upgrade `magda-preview-map` to v1.0.0 for proxy host list helm chart configuration support
- #3148 @magda/authentication-plugin-sdk was bundled incorrectly since 0.0.60-alpha.10
- #3150 Add a blank "Like/Dislike dataset" button as placeholder for external UI Plugin componnents
- #3156 web UI: display original source name when it's available
- #3157 strip html tags from dataset description on dataset result page
- #3159 Upper case first char of text display for "Update Frequency", "Tags" & "Themes" on dataset details page
- #3155 remove "keyword type" defined for "description" fields to avoid "term" oversize
- #3160 Add strip_html filter to "description" fields for elasticsearch indexing analyzer
- Remove "data.gov.au" keyword from "correspondence-api" email "from" field
- #3166 Update text description under the data source section on data detail page
- #3168 Fixed: double clicking the search icon button will clear search text input incorrectly
- #3171 Make Preview Map Preference Configurable
- #3173 Allow External UI plugin to be supplied to add support to particular format in a customised way
- #3177 Bring back Map Preview on Distribution Page
- #3174 When service is WMS / WFS, render a layer selection / Feature Type dropdown if multiple layers / feature types are available
- #3178 Better Error Handling for Preview Map via postMessage
- Upgrade format & rating minion to 1.0.0, Preview Map to 1.0.1
- #3179 Fixed Invalid HTML in description make Google Chrome Unresponsive
- Further simplify the error message from map preview module
- #3175 Make cloud sql proxy chart image version configurable, add autoscaler support & increase default resource
- #3185 Adjust migrator jobs running sequence so registry-db job will be run earlier
- #3170 Remove unused old admin UI endpoint from Gateway
- #3164 Add `showContactButtonForNoContactPointDataset` helm chart config option
- #3186 Fixed: avoid extra slash in inqury email dataset URLs
- #3188 Publish openfaas chart & Move openfaas helm chart out of main repo
- #3183 Make search input accept empty string as search query string
- #3167 Upgrade chrono-node to latest version
- Improve CSV visualisation tool date columns recognition logic
- #3161 Fixed: UTF-16 encoded CSV causes "unsupported Unicode escape sequence" error when saving a dataset draft
- Upgraded format-minion to v1.0.1
- #3198 Indexer will by default auto reindex / trim obsolete publisher / format weekly
- #3201 Fixed indexer might throw an error and interrupt crawling process upon invalid data
- #3343 Consolidate admin/settings UI functionalities into "Settings" area

## 0.0.59

- Allow Magda API endpoints to be served at non-root path
- Fixed: Distribution Page may show a blank page when the distribution has no downloadUrl #3039
- Fixed: Date Extractor for metadata creation tool will fail to process CSV or excel with incomplete rows #3040
- Other Date Extractor extration accuracy improvement
- Admin Panel User Admin feature should set/unset both isAdmin field & admin role for compatibility purpose #3033
- Make GET /auth/users/all API return user role info as well
- Make PUT /auth/users/:userId API accept other user field rather then `isAdmin` field only
- Release `acs-cmd` & `org-tree` as separate NPM packages
- Add set admin function to `acs-cmd` commandline utility package
- #3024 Gateway will automatically proxy all GET requests received at `/api/v0/registry` to registry read-only nodes (excepts Hooks APIs)
- #3053 Disabled `faas-idler` by default
- For #3010:
  - Set `autovacuum_freeze_max_age` & `autovacuum_multixact_freeze_max_age` default value to lower value (100k & 200K) for `events` table only
  - Added daily DB VACUUM ANALYZE script
  - Allow akka.http.server `requestTimeout` & `idleTimeout` to be configured via registry api helm chart
  - Allow gateway proxy timeout setting to be configured via gateway helm chart
- Change openfaas docker image repository
- #3057 Fixed: API `/auth/plugins` will skip the failed loading config item and return other config items without breaking request processing
- #3060 Upgrade urijs to 1.19.5
- #3051 Make command line tools DB PORT is configurable

## 0.0.58

- Added Documentation for Magda Helm Charts (generated using [helm-docs](https://github.com/norwoodj/helm-docs))
- Upgrade papaParse to 5.3.0 for the [Regular Expression Denial of Service (ReDos) vulnerability](https://github.com/magda-io/magda/network/alert/magda-web-client/package.json/papaparse/open)
- Fixed papaParse's chunk data loading HTTP 416 Error (on our forked repo)
- On dataset page, display an alert box when the dataset is superseded or retired
- Added Helm chart option to disable "use internal storage to store file" option in metadata creation tool UI
- Fixed: elasticsearch helm chart incorrect selector
- Updated cluster-issuer & certificate api version to be compatible with [cert-manager](https://cert-manager.io) v1.0
- Fixed: some helm chart (gateway & web) deployment doesn't allow setting `replicas` value properly
- Added an opt-in for chart/map/table previews if files are large.
- Upgraded helm-docs to v1.2.1
- Upgraded minio to 7.1.2
- Allowed region to be specified for storage API
- Made storage API process `BucketAlreadyExists` error code correctly when create bucket
- Fixed `magda-builder-scala` docker image failed to build due to expired resource link
- Fixed: Registry should not create an event when failed to delete the record #2976
- Fixed: Time Travel API response 500 sometimes #2977
- All registry APIs that create / changes / updates the data will now return the eventId of the event created for the operation #2983
- When submit a dataset, system will try to tag current version with relevant EventId #2980
- Keep tracking superseded data files in versions to avoid superseded data files being deleted #2981
- UI Changes that allow user to access the distribution page of different versions #2982
- Use pseudo url for data file stored in storage api #3000
- Turn off `Open In National Map` Button for Internal Storage data file Link
- Use [magda-preview-map](https://github.com/magda-io/magda-preview-map) v0.0.58
- Fixed: Dataset Creation Tool may not always capture format properly #3001
- Add Authentication Plugin Support to Gateway & UI
- Authentication Plugin Documentation
- Publish AuthApiClient as a NPM package
- Publish Authentication Plugin SDK as a NPM package
- Publish create-secrets tool as a NPM package
- Replace google auth provider with auth plugin [magda-auth-google](https://github.com/magda-io/magda-auth-google)
- Replace ckan auth provider with auth plugin [magda-auth-ckan](https://github.com/magda-io/magda-auth-ckan)
- Replace internal auth provider with auth plugin [magda-auth-internal](https://github.com/magda-io/magda-auth-internal)
- Remove Google, CKAN & internal auth provider code from Gateway codebase
- Publish docker image utils as a seperate NPM package @magda/docker-utils
- Use magda-auth-arcgis auth plugin instead
- Make `Add a dataset` link on Homepage (admin user only) go to metadata creation tool directly
- #2985 Allow default web route to be configured like all other route (allow specify method, auth etc.)
- Removed `createGenericProxy` from Gateway codebase

## 0.0.57

General:

- CSV Connector can now process ampersand character properly
- Fixed broken link minion causes json schema validation error
- Upgraded typescript to 3.7.2 & Use [Project References](https://www.typescriptlang.org/docs/handbook/project-references.html) to organize typescript project
- Upgraded prettier to 1.19.1 to [support typescript 3.7 better](https://prettier.io/blog/2019/11/09/1.19.0.html)
- Moved out [connectors](https://github.com/magda-io?utf8=%E2%9C%93&q=magda+connector) & [minions](https://github.com/magda-io?utf8=%E2%9C%93&q=magda-minion) from main magda repostory
- Broke helm chart to `magda-core` (core magda components excluding `connectors` & `minions`) & `magda` (full magda chart) and adjusted CI pipeline accordingly
- Release [npm packages](https://www.npmjs.com/search?q=%40magda) for building `connectors` & `minions` without depending on main repo
- Upgrade charts to use with Helm 3, Kubernetes 1.17 and Minikube 1.7.2
- Make recompiling and updating create secrets scripts an action in the CI
- Move [magda-preview-map](https://github.com/magda-io/magda-preview-map) out of the core repo
- Upgraded everything cert-manager related to work with v0.13
- Update build & run document to provide more information regarding running local build connector & minion docker images
- Update `building and running` documents: replace `npx` with `yarn` in all commands & replace keywords `npm dependecies` with `dependecies`
- Update `building and running` documents: remove `lerna` & `pancake` from `prerequisites` list
- New: Extract metadata from data portal URLs
- Fixed function is incorrectly deployed for UI only deployment
- Use helm3 in inttest:registryAuth step in CI
- Make Magda charts helm v3 charts
- Add migration document for migrating Magda release v0.0.56-RC6 or eariler to v0.0.57-0
- Use a feature flag to turn on/off the dataset approval workflow
- Add internal authentication provider allow user to be authenticated locally
- Upgrade to typescript 3.9.5
- Add missing `cloud-sql-proxy` dependecy to `magda-core` chart
- Add more operators to Registry /records & records/count API `aspectOrQuery`
- Add `aspectOrQuery`, `orderBy`, `orderByDir` & `orderNullFirst` parameters to Registry API /records & records/count
- Upgrade [bcrypt](https://www.npmjs.com/package/bcrypt) to 5.0.0
- Make the constructor of AuthorizedRegistryClient also accepts a customised jwt token.
- Set pwgen to `0.1.6` (was `^0.1.6`)
- Remove ESRI-portal related code from deployment charts
- Allow admin users to download history report of a dataset
- Fixed `building-and-running` doc: instruct users to update helm charts with `yarn update-all-charts`
- Added Docs of supplying custom policy files
- Openfaas should be turn on / of via condition field `global.openfaas.enabled` instead of `tags`.
- When `global.openfaas.enabled` is false, all openfaas dependent objects will either report error to users or be skiped for creation.
- Largely Reduced the web-server docker image size
- Fixed incorrect path in API docs #2964

UI:

- Fixed the issue of modifying date string in text input using backspaces to an empty string will cause text input to reset text input
- Added pre-specified options for themes on Add dataset page
- User can't input a future date to date of last modification on add dataset page
- Allow to config whether keywords / themes input can accept manual inputs (or only pre-defined phrases)
- Only check for validity in temporal filters (in the search dataset page)
- Allow a blacklist of strings to be specified for automatic keyword generation
- Make the global notification banner configurable
- Removed all references to the DTA Design System react components, so that all styles come through our SCSS compilation, which should make SCSS smaller and more consistent.
- Swap the order of custodian & team dropdown on add dataset page
- Updated text & margin of add files page to match the new design
- Updated Add Dataset Welcome screen options UI design
- Added UI for "Link to dataset already hosted online" box
- Added UI for "Link to an API or web service" box
- Added UI for storing files
- Added UI for "Publish as Open Data to data.gov.au"
- Refactor view dataset page & remove the edit function from the page
- Clarify tooltip text
- Use a new "All done!" screen at the end of the dataset flow
- Added Error Screen for adding distributions from URL feature & allow manually create distributions
- Disable edit button on harvested datasets
- Added the support of processing ESRI REST API URL
- Use IBM Plex Sans font
- Fixed: error notification no longer has a white background
- Added `add dataset review page`
- Make `add dataset page` save state data to registry (unless in preview mode) rather than localStorage
- Change search text to say "Search for data" instead of "Search for open data"
- Set flag `previewAddDataset` to `false` by default
- Made files that are dropped get uploaded, if this is specified by the user
- Bugfix: Read raw value from CSV files
- Add a flag `placeholderWorkflowsOn` to hide UI components that are not complete yet
- Add `MyDatasets` Section to Homepage (after logged in)
- Fix magda & ckan login options are missing
- Always set dataset publishing state to "published" no matter the approval flow is on / off
- Fix a sheet file contains date would cause blank screen during processing
- Set an error if security classification is at PROTECTED or above
- Add revised edit flow for adding/deleting/superceding existing distributions
- Show extra metadata on the dataset page
- Fixed ckan-export aspect's fields should be only changed via JSON patch from the frontend (#2887)
- Fixed patch ckan-export request trigger 400 error when the aspect doesn't exist at all
- Allowed UI to be served at a different URL path
- Fixed: incompatible `papaparse` version makes CSV file download fail (set to version 5.1.0 now)
- Fixed: Upgrade dompurify to 2.0.3 (#2952)
- Fixed: Borken SSO links (#2951)

Storage:

- Add an API for storing and streaming content
- Add a DELETE endpoint
- Improves error handling (returns 404 from GET if the file doesn't exist)
- Add apidocs
- Add endpoint to create a bucket
- Restrict file upload to admins only
- Add authorization to GET endpoint
- Support multipart upload
- Fixed: minio chart will not be deployed if storage-api is not turned on
- Make MinIO a dependency of storage's helm chart
- Make minio, by default, deploy with `Recreate` strategy

Gateway:

- Add /data to ckan URL, remove the `came_from` param
- Allow cookie option to be configured via helm chart
- Set cookie `secure` default value to `auto`
- Set dev site cookie `sameSite` attribute to `none`
- Allow to configure webRoutes in a way of similar to routes (i.e. specify method, auth etc)
- Make preview-map route configurable (through web route)
- Gateway will auto add headers to turn off cache if the incoming request carry a `Cache-Control` header that contains `no-cache` keyword
- Upgrade arcgis oAuth plugin to latest version used by Terria team #2959

Authorization:

- Made integration tests for authorisation run automatically as part of CI.
- Added ability to set per-record authorization policies in the registry (for getting a single record)
- Added ability to set per-record authorization policies in the registry (for getting multiple records)
- Added ability to use OPA policies that use data types other than strings in the registry
- Added authorization inside links with dereferencing on or off, for the `/records/<id>` endpoint
- Added authorization inside links with dereferencing on or off, for the `/records` endpoint
- Added per-record authorization around the `/records/summary/<recordid>` endpoint matching the `/records/<id>` one.
- Added per-record authorization around the `/records/summary` endpoint matching the `/records` one.
- Added per-record authorization around the `/records/<recordid>/history` endpoint
- Added per-record authorization around the `/records/<recordid>/history/<eventId>` endpoint
- Fixed a bug where the registry would attempt to query for policies against every single record id in the registry all at once.
- Added API Key authentication support
- Add auth policy to distribution records
- Allowed custom opa policy files to be supplied during the deployment
- Fixed: process `unconditional true` properly #2956
- Remove ESRI Policy from built-in OPA policy list (but still make them available for unit tests) #2958

Registry:

- Made events record the correct user id
- Fixed Registry History API Performance Issue when limit=1 & Updated Registry History API Document
- Fixed not support `Neg` operator in OPA policy
- Fixed: when `authnreadpolicyid` is set to empty string, registry will throw 500 error #2955

Search:

- Began work on a NodeJS-based search API to replace the scala one
- Allow fetch region record by region id
- Use a list of acronyms for publishers that have a 'Department of' in their name

Minions:

- Added a minion for publishing to CKAN

CI/CD:

- Use Directed Acyclic Graph in Gitlab CI
- Moved data.gov.au specific connector config out of the magda helm chart

Others:

- Use a "Year" column from a CSV file to extract a temporal extent
- Added tentative documentation/scripting for building and running on microk8s.
- Added tentative documentation/scripting for building and running on k3d.

## 0.0.56

General:

- Add multi-tenant support. Deployed as single tenant by default.
- Add access control capability to registry api, only applying to read operations currently.
  The registry service can be configured to support either hierarchical organization based access
  policy (default) or Esri groups based access policy.
- Add esri portal connector. Read its README.md file before use.
- Changed the way of `auth-secrets` to be created in gitlab
- Add horizontal pod autoscalers to crucial services

Registry:

- Changed database schema.
- Provide services based on Tenant IDs.
- Fixed PATCH request to registry won't trigger notification to webhook
- Moved provenance and information security information out of `dcat-dataset-strings`.
- Removed some unused fields from `dcat-dataset-strings` - it should now be back to looking more-or-less like DCAT.
- Added the feature of validating aspect data against JSON Schema (Default to off)
- Fixed request for all tenant records returning `[]`.
- Made the registry treat tenant id `NULL` as equivalent to tenant id `0`

Gateway:

- Add tenant ID header to client requests.
- Add ArcGIS/ESRI Authentication provider, including support for on-premise instances of ArcGIS Portal.
- Add Vanguard (WS-FED) Authentication provider
- Upgrade passport google strategy to 2.0.0 to solve the legacy API access issue
- Add `webProxyRoutesJson` command-line argument, allowing non-API proxy routes to be configured.
- Only start / keep sessions for logged-in users to make content cachable for non-logged-in users

Search:

- Prevent freeText query from being None which will cause score to be 0
- Add tenant specific search.
- Fixed facet options (publishers) API error: Invalid aggregation name
- Fixed Querying formats in upper case causes two formats to be selected

Indexer:

- Fixed indexer throws an error when temporalCoverage aspects intervals is an empty array
- Index datasets with tenant ID.
- Fixed indexer throws an error when affiliatedOrganisation field is created
- Fixed indexer incorrect parsing bounding box data in spatialCoverage aspect
- Added auth when crawling the registry
- Fixed Data.json spatial bounding box ordering not understood
- Handle and log the exception "Object is missing required member 'id'"

Cataloging:

- Added new aspects for publishing state and spatial coverage
- Updated Indexer and Search API to support publishingState
- Updated new dataset demo UI page to support adding new datasets
- Updated dataset ui page to be able to edit fields
- Added editor / editor type abstraction for making state management simpler for large forms.
- Added "Add Catalog" page

UI:

- Made dataset page printer friendly
- Display search box placeholder text at a lower opacity while the field is in focus.
- Showed text message if there are no tags to display in a dataset page.
- Removed gap after data quality star rating
- Replaced star emoji in static page markdown with quality star icon
- Refactored web client to group similar things together
- Implemented basic admin pages in react ui
- Started implementing new add dataset flow design changes
- Fixed web-client code loaded & run twice
- Added basic spatial preview to add dataset
- Revised add dataset first metadata page for conformance with design
- Improved edit dataset page overall styling & editor behaviour
- Show Database ownership information on dataset page (Admin Only)
- Added vocabulary suggestion for keywords & themes input on new dataset page
- Extracted keyword will be filtered by vocabulary APIs
- New add dataset page design
- Added new progress meter
- New design for file upload area
- New dropdown box design on `Dataset details and contents` page
- New Design for Multiple Tags input for keywords & Themes on `Dataset details and contents` page
- New Design for Accrual Periodicity Recurrence input on `Dataset details and contents` page
- New Design Spatial area input on `Dataset details and contents` page
- New Design for text input & text area input on add dataset pages
- Next & save button style adjustment on add dataset pages
- Update pagination to meet WCAG and use correct semantic HTML tags.
- New Design for files review box on `Details and Content` page
- Moved dataset description to Details and Contents page & added `additional notes` text box to submit page
- Added words count to Textarea
- Adjusted tooltip style & layout
- Overall page layout adjustment for `Details and Content` page
- fixed: keywords & themes extraction might produce duplicate keywords for different files
- Restricted dataset contact point display options to team members, team or org and made it save in the registry.
- Added ability to set the owning org unit in Add Dataset flow.
- Stopped keywords & themes extraction producing duplicate keywords for different files
- Capped the maximum input to retext for keyword extraction to prevent browser freezeup
- Made all keywords extracted lower case
- Made extracted keywords fall back on non-vocabulary-filtered keywords if it doesn't find enough keywords matching the vocabulary.
- Style adjustment for question Who can see the dataset once it is published on Access and Use page
- Added access location auto complete input on Access and Use page
- Fixed a JS error which causes blank screen on Organisations Page
- Fixed: drop a folder to Add dataset file drop area will break the UI
- Show an error message screen if the user is not allowed to access the add dataset page
- Updated security classification & sensitivity questions according to the new design
- Make sure all publish new dataset errors are captured and shown to users on add dataset page
- Added Custodian field to the 'People and Production' page
- Added the ability to add references to datasets that a new dataset was derived from.
- Added `dataset status` question to 'Details and Contents' page
- Fixed edit file panel text input layout
- Fixed a blank screen issue on dataset page
- Improve visualisation data processing:
- Use worker to download & process csv file
- Chart & table modules share the same data source to avoid unnecessary download
- Allow to set max. number of rows that accepted by the the visualisation module
- Fixed "NOT SET" appears on the dataset page for non-admins
- Made the add dataset flow only say it found keywords in the document if it actually did so.
- Made the datepicker for add dataset use the correct colours.
- Updated schema.org Dataset and DataDownload semantic markup for rich search results
- Fixed typos in no-print styling and adding keywords tooltip
- Added a preview mode for add dataset, that allows all users to use add dataset but prevents them from submitting.
- Fixed text wrap around tooltip
- Fixed Add Dataset / Licence setting: Long file names should be wrapped to the next line
- Added a new color (slightly grey) for preview screens
- Removed unnecessary margin in the filter facets
- Map Preview: avoid selecting Esri feature server distribution for preview
- Fixed mobile views incorrect min. width
- Drafts should be ordered by date on Drafts list page
- Changed text to reflect state/territory/country accordingly
- Fixed CSV loader didn't retry the different line ending correctly
- Saved publisher id in the database
- Added hover text for the tooltip beside the date-picker in the Add Dataset page
- Added a distribution hyperlink to the title of resource links
- Made the default name of a dataset blank
- Added a tooltip for dataset names
- Rename "Spatial area" to "Spatial extent"
- Fix issue with user manually typing dates
- Add tooltip to explain the difference between MB and MiB, KB and KiB, etc.
- Fixed `validateDOMNesting` warning
- Fixed warning for placeholder text being a boolean value
- Added unique key to the topmost `div` of `codelistEditor`
- Rename `license` to `licence` where appropriate
- Added unique keys to the props in `Stories.js`
- Added Mandatory Field Validation to the Add Dataset Flow
- Reworded `team` to `business area`
- Added tooltips to the `Production` section of the `People and Production` page
- Reworded the user access options
- Removed help icons without content
- Made print button call `window.stop` before `window.print`.
- Made read-only calls to the registry api use `/registry-read-only`.
- Fixed: if featureFlags are not set, edit buttons are always shown on dataset page
- Add specific color to recent search item text
- Improve keywords generation logic for Spreadsheet
- Mention that choosing state is optional
- Make spatial input default to Australia
- Render selected time intervals above the date picker so that nothing gets hidden

Gateway:

- Add ArcGIS/ESRI Authentication provider, including support for on-premise instances of ArcGIS Portal.
- Add Vanguard (WS-FED) Authentication provider
- Made organisation field an autocomplete in add dataset page.
- Corrected Vanguard Authentication Landing Url
- Fixed Google oAuth Error: authRouter

Access Control:

- Introduced Role & Permission Structure
- Recognise unauthenticated users as anonymous users role
- Introduced Open Policy Agent as policy evaluation engine
- Search API will return datasets based on user's Roles & Permissions
- Users with access to draft datasets can see a new `drafts` tab
- Organization hierarchy & make Organization hierarchy data available for access control
- Filter datasets based on user's current organization unit
- Added API to see what users will approve a potential dataset

Others:

- Made registry-api DB pool settings configurable via Helm
- Make broken link sleuther recrawl period configurable via Helm
- Set version of Helm used by GitLab CI to 2.16.1
- Format minion will trust dcat format if other measures indicate a ZIP format
- Format minion will trust dcat format if other measures indicate a ESRI REST format
- Added ASC to 4 stars rating list
- Removed Travis CI (Gitlab CI still remains)
- Disabled tenant-api & tenant-db when `enableMultiTenants` = false
- Excluded organisations that are owners of thesauruses (keyword taxonomies) from being considered as owners of datasets via CSW connector
- Fix data.json connector dcat-dataset-strings aspect so keywords are stored correctly
- Fix CSW connector may process XML response incorrectly and report `no id` error
- Fix: CSW connector should look for alternative location for title, keywords & spatial extend for aurin data source
- Upgrade Scala dependencies versions & added scalafmt support
- Fixed doc to reflect [lerna deprecating an option](https://github.com/lerna/lerna/commit/f2c3a92fe41b6fdc5d11269f0f2c3e27761b4c85)
- Fix potential memory leak by deregistering listener when Header is unmounted
- Removed unnecessary requirement for >= 1 keyword in the dcat-dataset-strings schema.

## 0.0.55

UI:

- Updated design system components
- Integrate sentry release notification and source map upload
- Added "role" to account page
- Fixed clicking out of search filter causes the results to refetch
- Provide access to CKAN Data API for enabled resources
- Changed label of email validation error message in suggest dataset page to be consistent with rest of the error messages in that page

Correspondence:

- Broadened search for a valid dataset email contact address

Others:

- Upgraded JDK version for magda-builder-scala to 8u201
- Added craco to allow for some Create React App overrides for a faster build and to allow use of PDFjs without warnings.
- Fixed Unable to use Google / Facebook Login on Preview Site
- Fixed warnings: `as` props is compulsory for AUpageAlert & boolean value was sent to `id` props
- Fixed docker build cache issue that causes DB image not build

## 0.0.54

Connectors:

- Add organisation ignore filter to CKAN connector

UI:

- Upgraded to create-react-app 2
- Fixed javascript error when user clicks away from facet dropdowns
- Distribution pages: prepend file-specific icon to title
- Added a basic new dataset page
- Fixed javascript errors in download analytics and pie charts
- Added results of automated metadata extraction spikes to add new dataset page

Analytics:

- Added dataset id to dataset request/feedback where applicable
- Added value to the "Search result and click" Google Analytics event that will show averages and other numeric aggregates in Google Analytics.
- Upgraded Elasticsearch to v6.5.4 Elastic4s to v6.5.1
- Elasticsearch related test cases run on Docker container than than local node
- Made search always match all input keywords (MatchAll mode)

Indexer:

- Fixed issues of snapshot creation & restore
- Indexer will auto reopen index if it's closed
- Added Geo Spatial Data Validation to Indexer
- Added `simplifyToleranceRatio` & `requireSimplify` Parameters to Indexer & Allow them to be configured per file & per data
- Used manual simplified STE region data
- Fixed timeout issue when filter by WA state

Others:

- Change content api delete response status code from to 204 to 200 so its content can be read.
- Upgraded Elasticsearch to v6.5.4 Elastic4s to v6.5.1
- Elasticsearch related test cases run on Docker container than than local node
- Fixed: datasets with null description could lead to blank search result page
- Stopped gateway from passing auth and single-hop headers through to other services

## 0.0.53

Connectors:

- Allowed Ckan connector to pull datasets belongs to a specified organisation
- Added `presetRecordAspects` & `extra` parameters supports to all connectors
- Improvements on CSW connector licence info retrieve

Dataset Page:

- When `dcat-dataset-strings.creation.isOpenData` is set, show `Public / Private` label accordingly

Others:

- Upgraded dependencies with snyk.io vulnerabilities.
- Allowed Favicon to be configurable through API & Admin UI
- Added `magda.reservedFor=statefulsets:NoSchedule` toleration to statefulsets.
- Improvement indexer scala test cases for Travis
- Made feature images easier to configure

## 0.0.52

Authentication:

- Added `Australian Access Federation` Rapid Connect Single-Sign-On‎ Support

Ops:

- `create-secrets` tool can create secret for `Australian Access Federation` Rapid Connect
- Allows gateway routes to be overiden from top level values file
- Added `enableCkanRedirection` switch to turn on or off Ckan redirection feature from gateway
- Added `global.enablePriorityClass` switch to turn on or off `priorityClassName` on deployment templates
- Improved responsiveness of registry-api when it's under load
- Made the content-api accept authentication by default
- Lowered the resource requirements for the apidocs-server based on data.gov.au usage.

Search:

- Made the lowest quality rating for a dataset in the search index 0.01, so that 0-quality datasets rank properly relative to each other.
  Others:
- Fixed /dashboard and /dataset?q=keyword redirects for migrating easily from CKAN sites

Accessibility:

- Added `aria-label` field to Facet buttons to reflect the current filter selection

Connectors:

- Made the CSV connector put the description column in the distribution description, not just the dataset one
- Fixed: CSW connector does not capture all distributions for some datasources (e.g. TERN)
- Fixed: CSW connector does not capture persistent URL or licences for some sources (eg. geoscience australia)

Interoperability:

- Fixed /dashboard and /dataset?q=keyword redirects for migrating easily from CKAN sites

Development:

- Made connector tests use the typescript of the code under test through ts-node, instead of the `/dist` directory.

Others:

- Changed terminology for data rating to `Linked Data Rating`
- Fixed: Empty source link shows as a working link on dataset page
- Removed hard-coded URL for CKAN authentication, made it configurable.

## 0.0.51

Accessibility:

- Made the image and the text wrapped in a single link and the set image alt value to null for stories on the home page
- Made navigation items screen readable by removing unnecessary aria-hidden label from menu
- Got screen reader to say "Open Data Quality: 3/5 stars" instead of repeating star rating text
- Stopped tab order reverting to body after tabbing through the search box
- Made the "Skip to Navigation" skip link go to the first navigation item rather than trying to target the wrapping `<div>`
- Change search selection color for non-home pages
- Fixed form error message not being heard in order by screen readers and also when field is in focus by putting them in the same label element.
- Fixed: Error messages are not associated with their form fields on suggest dataset form
- Made the data quality tooltip read its contents out, and link to the data quality page.

Charts:

- Fixed chart won't displayed correctly under IE11
- Added google analytics event when chart fails to load

Ops:

- Add readiness and liveness probes to all services
- Changed the migrators to look for "password" instead of "postgres-password" in the cloudsql-db-credentials secret.
- Added shortcut to build create secrets script for magda-config repo
- Added preemption priority classes
- Added ability to add fully customised affinity to statefulsets in helm
- Fixed docker image build script failed on windows platform
- Added `cloudsql-db-credentials` to create-secrets tool
- Only runtime dependencies will be included by docker image build script
- Fixed an file selector error in create-secrets script when current directory & non of its sub directory has \*.json file
- Changed SQL for querying aspects by path/value so that it could take advantage of JSONB indices.

Security:

- Redirect HTTP requests to HTTPS URLs

Search:

- Added boosting to results which have location information that overlaps a known region whose name/shortname appears in query text.
- Fixed stream processing issue when re-indexing, mitigating out-of-memory risk too
- Fixed index trimming failure issue when re-indexing
- Fixed: indexer throws an error when processes spatial data number with more than one decimal places
- Fixed stream processing issue when re-indexing, mitigating out-of-memory risk too

Others:

- Download unknown project open data licence URLs to extract human readable licence
- Removed the .bin extension from the logo

## 0.0.50

- Added configurable argument to `magda-web-server` module to accept Google Analytics IDs
- Make datasetSearchSuggestionScoreThreshold and searchResultsPerPage runtime configurable
- Hide dataset source for csv datasets
- Make sure MS Excel format does not break into two.
- Make home page items come from content api
- Make header menu items come from content api
- Remove all global references to config.appName and allow getting this configuration item from content api
- Changed some existing content ids to group things better
- Reorganised content api to require less number of requests to get small JSON content items
- Email Templates are configurable from content API
- Allow a CKAN non-root path to be used for redirects
- Allow CKAN resource downloads to pass through to CKAN to maintain links
- Add something to mock admin interface to make users admins and not
- Take CSW connector distribution access url and format from distributor field under distributionInfo as well as from transfer options (previous.)
- Delete registry API /records/{recordId}/aspects endpoint
- Hook actors will report its status to its parent actor when changes
- Updated external links on About page to open in new window
- Fixed some WA source spatial data are not indexed properly
- Boost the score weighting of name & acronym field during org seaching
- Sort by relevence unless keyword is "\*" (in this case sort by Alphabetical order) during org search
- Removed search.data.gov.au-specific third party javascript
- Added ability to include arbitrary HTML in `index.html` through the content api
- Fixed: added added vendor prefix to `au-select` component CSS
- Fixed content-api test case logic
- Migrate static pages to a json structure and make it editable.
- Hide "Download" button for distributions without downloadUrl
- Fixed content-api migrator script version conflict issue
- Make footer area configurable
- Fixed broken document link in docs/README.md
- Show quality rating only if present
- Fixed: cached auth api response causing login problems
- Upgraded java version for `magda-scala-builder` docker image to fix `unsatisfiable constraints` error
- Make jurisdiction field available from registry api
- Fixed an issue of scss-compiler not updated all variables
- Added more configurable scss variables
- Added internationalisation library to frontend
- Adjusted content-api to prevent SQL injection
- Made occurrences of "organisation" in the front-end configurable through internationalisation.
- Make jurisdiction information available from search api
- Organisation search result from search api will be aggregated based on jurisdiction and name
- Updated helm config to allow for statefulsets to be kept off GKE preemptible nodes.
- Switched `<a>` element in `HeaderNav` to be `<Link>` from `react-router-dom` to maintain router history
- Fixed: minion crawler may go into an endless loop
- Fixed an issue caused search Panel option filter stop working
- The CkanTransformer will remove generic organisation descriptions.
- Fixed non-RC versions not being released to docker hub.
- Fixed DAP connector not automatically being released to docker hub.
- Fixed an issue that `create-secrets` didn't handle `cloudsql-instance-credentials` & `storage-account-credentials` probably
- `create-secrets` will load ENV vars according to question data types
- Include Magda user agent in external HTTP resource accesses
- Made admin UI create CSV connector with internal URL
- Fixed magda-apidocs-server incorrectly builds into \$PWD directory on windows
- Fixed an issue that DAP connector not handle access error correctly
- Stopped caching anything requested through the admin ui.
- Removed old admin ui code
- Made access notes show up on distribution page with configurable text
- Added contact point to distribution page, made title configurable
- When `match-part` search strategy is used, a message is shown on UI
- Made broken link minion per domain request wait time configurable
- Fixed mobile menu not show-up properly
- Made the events page size and the webhook timeout configurable in the registry.
- Stopped the format minion from stalling on long URLs

## 0.0.49

- In web dataset page, made facet search reset when user clicks on facet button so that it does not show result from last time.
- Made issued and update date not appear when valid dates are not available.
- Specify correct externalURL and namespace for gitlab to fix deployment auth.
- Add a CSV connector
- Rename config page to admin; include connector management functionality
- Update content API to accept csvs
- Enable admin api and fix up admin api ability to work in speficied namespace
- Set CSW connector MD_Metadata dateStamp as issue date
- Made "Ask a question" button send the question directly to the contactPoint for the dataset if possible.
- Added ability to ensure that all emails go to default recipient despite what their normal recipient would be.
- Made contact point visible on dataset page
- Allowed UI SCSS variables to be changed via k8s job
- Added a `set-scss-vars` script for updating UI SCSS variables
- Fixed that `leaflet.css` had not been included by SCSS compiler
- Allowed the cluster to be protected by a password
- Made the add a dataset form appear where the results get to a certain configurable score threshold
- Made the CSW connector look for names for service-based datasets in another place
- Made CSW connector gracefully handle datasets without ids instead of crashing
- Fixed Gitlab UI only preview failed to download main CSS file
- Removed CORS handling from Scala APIs, should be entirely handled by the gateway.
- Made the format minion listen to `dcat-distribution-strings` instead of `dataset-distributions`, should be more efficient
- Better support for SPSS files in the format minion
- Made files marked with a ".extension" format resolve to "extension" correctly in the format minion.
- Fixed an redirection issue when handling 404 status from registry API
- Re-added admin api to released docker images
- Made gateway nominate its container port to fix it working with a password and also the GCE ingress
- Stopped the helm chart from assuming that the `postgres` user password and the `proxyuser` password are the same in GKE deploys
- Fixed the storage account credentials being created incorrectly through the secrets tool
- Allows gateway to redirect trailing slash for APIDocs module

## 0.0.48

- Add No results label when there are no results in organisation and location facets.
- Make sure CKAN connector doesn't loop forever if server reports wrong dataset count or empty page
- Remove AU govt logo and add more space to top menu.
- Whitelist KMZ.
- Rename sleuthers to minions
- Add ability to change content (logo).
- CSW connector will exit with code 1 if error happens
- Fixed an issue of format enhancer processing MIME
- Fixed an issue that format enhancer may exit when dcat-string not available
- Updated email template & make email clickable
- Updated aims connector URL
- Raised the default resources for registry-api.
- Added API document for Minions
- Updated magda links in footer.
- Switch apidocs root to `<host>`
- Removed unused jQuery dependency from format-minion
- Split the registry api into full and read only modes that can run separately in production
- Take open data connector licence from dataset level to distribution level and add basic black box test
- Fix logo vertical alignment and partially hidden issue
- Made header padding even
- Made the broken link minion use `GET` for everything and ignore the data.
- Fixed trim with zero records deleted returning 400

## 0.0.47

- Document public portions of authorization api
- Document search api
- Make contents API and contents database migrator for storing items which will be dynamically configurable in the future.
- Hyperlink organisation url on organisation page
- Align format facet based on its position on the page
- Reformat page title to be consistent throughout
- Remove browser default button background for search facet (for safari and IE)
- Removed `x-powered-by` & `server` headers from response
- Updated header logo to be correct branding type
- Uses the Header component from Design System
- Registry will now periodically retry Webhook
- Fixed an issue that connector record triming might not fully completed
- Fixed an issue that indexer webhook event types not properly setup
- Removed feedback-api, discussions-api and discussions-db as they're no longer used
- Moved standard and data.gov.au config to a separate repo
- Added better readiness probes to elasticsearch
- Adjusted resources requirements/limits
- Push footer below the fold while loading page content
- Unify tooltip styles across different instances, remove react-tooltip
- Change chart config dropdown label from xAxis to X axis and yAxis to Y axis
- Unify H1 size
- Fixed an issue that dataset / organisation debounced search request not cancel upon URL changes
- Upgraded terriajs server to 2.7.4 to address redirect vulnerability.
- Added apiDoc for indexer

## 0.0.46

- Make pagination on mobile responsive.
- Added cronjob for broken-link-sleuther
- Remove all starting non word chars from organisation title
- Make pagination on mobile responsive.
- Fixed inconsistent case with format
- Made broken links sleuther perform a get request with content range when head request returns 405 (method not allowed).
- Make pagination on mobile responsive.
- Fixed a facet overflow issue on desktop
- Allow user apply default date in filter
- Mobile menu style change
- Fixed Not found redirect working differently in different browsers, and fixed not found error preventing new record from showing
- Added mechanism to produce api documentation
- Fixed an issue where organisation Page dataset links set incorrect `publisher` query parameter
- Remove extra slash when additional info is missing on dataset page and distribution page
- Added a tooltip to organisation filter if it's clicked to from the org page the first time
- Hid filters on mobile
- Made it so that if you follow a link with filters active on mobile, the next search you make cancels them
- Added a more generic purple tooltip component
- Added `create-secrets` script for managing secrets
- Make source link wrap and add line break
- Made dev connector jobs execute every week only

## 0.0.45

- Redirect CKAN/DGA Urls
- Add config for fallback banner
- prevent old content being loaded when navigating through page history
- Display a 'clear search' link after error message
- Fixed inconsistent breakpoints
- Unify styles of tagline for search results
- Unify result count style
- Fixed a date filter bug that freeze UI on slow internet
- Fixed the error 'Can't call setState (or forceUpdate) on an unmounted component' for Data Preview
- Fixed `Clear All` button not clear filter panel UI state
- Change non-homepage search placeholder text color to WCAG AAA compliant
- Added more details in organisations/publishers page to reflect design.
- Adjusted sitemap and robots.txt to help google navigate around better
- Made the javascript work with chrome 41 (googlebot)
- Made the fallback banner site url configurable

## 0.0.44

- Added more analytics events for Downloads/Views by Organisation, Search result click and Dataset request/feedback
- Removed `button` element for distribution download link on dataset page.
- Updated documentation for setting up `Docker Edge` for Kubernetes.
- Modified error message text and omitted homepage articles if search error occurs.
- Changed chart icons on dataset page
- Made `elasticsearch` supports synonyms
- Upgraded `elasticsearch` to v6.3.0
- Enable organisation search
- Disabled scroll to zoom on dataset preview map until map is clicked on and added terria zoom controls to preview map
- Change appearance of mobile search box
- Improve filter button icon alignment
- adjust dataset page layout to accomodate new mobile design
- Disable /auth route in production & change gateway health checking endpoint to /v0/healthz
- Stopped indexer skipping datasets that have no distributions. These datasets can now be discovered via search.
- Added more heuristics to charting, made it parse dates and sort the x axis.
- Improve chart view on mobile
- Fixed `Ask a question about this dataset` button (on dataset page) won't open form on safari browser
- Remove input content from Scala service Malformat query parameter error message
- Improved mobile navigation
- Improved dataset page paddings and margins
- Moved express helmet to gateway module
- Make chart title wrap
- Upgraded TerriaJS to 6.0.4 in preview map
- Changed the preview map to not use terrain.
- Made CORS, CSP, Node-Helmet and proxied routes configurable through helm.
- Add links to about page
- Fixed a rendering glitch with react modal
- Trim empty rows off before table rendering to prevent empty rows after sorting by column
- Make suggestion form scrollable on short screen
- Default button color fix
- Small improvement on how search box looks on mobile and desktop
- Improve organisation search page
- Added extra contact fields to registry & search organization API
- Added connector for CSIRO DAP (thanks @jevy-wangfei!)
- Adjust line spacing for dataset page
- Fix the bug that which does not allow add another option to publisher or format filters once you have performed a search using the filter.
- Improved CSW connector to avoid incorrect organisation information being picked
- Replace banner svg icon
- Improved styling of suggest dataset form
- Improve distribution link alignment
- Improve UI for chart loading error
- Make dataset ask a question form only scrollable on short screens
- Added auto gzip compress to gateway
- Made CSW connector retrieve country field from alternative JSON path
- Fixed Sitemap times out if input is invalid
- Fixed Organisation content position moved (flicking) during data loading
- Fixed Organisation page router history issue
- Fixed Search Panel `Clear` button doesn't work
- Fixed bug where dataset ids where "undefined" in distribution URLs.
- Corrected incorrect source-link-status aspect name in UI dataset request URL
- Updated URL of City of Launceston connector.
- Keep search text in synch.
- Make pagination on mobile responsive.
- Made CKAN harvesters execute on an hourly basis.

## 0.0.43

- Fix design system react import for SASS overrides
- Add breadcrumb for dataset page and distribution page
- Added further styling filters to coverup markdown rendering on dataset pages
- Added UNSAFE\_ annotations or refactored to prepare for [React async rendering](https://reactjs.org/blog/2018/03/27/update-on-async-rendering.html).
- Hide zendesk floating feedback button on mobile
- Modified the look and layout of the distribution pages.
- Made close button on suggest form rounded and thicker
- Location and Date filters can be applied by clicking outside of the box
- Changed registry /records api `pageToken` as long type parameter to avoid runtime error
- Improved mobile responsiveness on dataset and search results page
- Updated homepage tagline.
- Upgraded `basemaps.cartocdn.com` url to HTTPS.
- Upgraded `rollbar.js` 2.3.9 -> 2.4.1
- Added community link to header
- Map filter clear button only active when region is selected
- Fixed a bug in search filter that makes filters irresponsible
- Fixed a bug on not able to get correct distribution and blank dataset title in breadcrumb
- Changed chart icons on dataset page
- Fixed: Enter a dataset page with `*` query string will see a blank page
- Fixed: when checking if fetch is required, dataset id from url params need to be decoded
- Enable organisation search

## 0.0.42

- Implemented the new pagination design
- remove border for basal button style to prevent duplication
- Use http://colorbrewer2.org/#type=sequential&scheme=BuPu&n=3 for data vis palette
- Do not load preview map on mobile, give user option to view in national map instead
- Added redirect for CKAN dataset URLs (UUID or slug) to their new canonical location
- Fixed pagination bar shows incorrect result count
- Added Zendesk feedback widget activated via footer link
- Made end of content spacing consistent
- Added `flex` display and set consistent padding from footer.
- Added filter count to search results
- Made filter selections move only when applied on publisher and format
- reset pagination on query change
- Removed underline from organisations in search
- Modified styling for `ask a question` button to use secondary AUButton styling.
- Restricted markdown <strong> tag to be default style.
- Added `bottom-border` property to make dataset filters stand out more.
- Fixed page refresh when using a dataset tag as a link.
- Replaced underscores with spaces on distribution links, making them wrap on mobile
- Improved modal design on report/ask a question on a dataset
- Removed `totalCount` field from registry api pagination objects.
- Added `/count` endpoint to registry api
- Set default quality to 0 when indexing
- Use Async appender for logback logging
- Removed logging to file
- Akka logging setting adjustment
- Made publisher and format filter search use the search backend instead of client-side autocomplete.
- Updated data quality explanation
- Made go-to-external-distribution button into an <a> tag instead of a javascript button.
- Update some results found message

## 0.0.41

- Create Suggest a Dataset Page
- Add Suggest a Dataset on search results page
- Fixed display of chart axis config dropdowns in Firefox.
- Fixed LanguageAnalyzerSpec from generating stop words as search values.
- Updated prettier config to not reformat package.json in to an invalid 4 space tab width.
- Positioned the buttons & format icons at middle position of the Files & APIs section
- Made publisher acronym search case insensitive & added test cases
- Added vertical spacing for `DataPreview` chart fields.
- Added file icon and divider to search results
- Stopped format/publisher filter search returning wrong doc counts when there's no text query.
- Fixed a issue that state region layer could be removed from region filter panel map
- Adjust search box placeholder color to be more visible on mobile and more consistent on desktop
- Corrected email template style to be inline with designs.
- Switched development/preview to use let's encrypt certificates for HTTPS.

## 0.0.40

- Changed Publishers to Organisations in UI
- Modified `MonthPicker` tooltip icon's right padding
- Location filter: Make state selectable on the inital region filter panel open
- Made region and dataset configurable in search api.
- Added publisher name acronyms to elasticsearch
- Removed underline on coat of arms.
- Implemented `Tooltip` component to replace `react-tooltip` from `QualityIndicator`
- Made region and dataset configurable in search api.
- Fixed open in national map button not send correct URL

## 0.0.39

- implemented new UI palette with accessibility improvements
- remove MUI
- remove /contact page as it duplicates functions of feedback form
- Use DTA design system for Feedback form
- Use DTA design system for all form elements
- Changed linked data rating sleuther to `PUT` instead of `PATCH` data quality aspect
- Made linked data rating sleuther take output of broken link sleuther into account
- Removed datasetQualityAspectDef from sleuther-broken-link
- Update the look of facet searchbox to be consistent with DTA design system
- Mobile Aus Gov logo links to homepage
- Change the tag type of the background link on the homepage in order to correct the page refreshing when it shouldn't
- Added gitlab CI build config
- Fixed indexer's ability to make/retrieve ES backups
- Added ability for magda-postgres to retrieve WAL backup as "immediate" rather than catching all the way up with the WAL log.
- Removed implied ability for magda postgres to use a backup method other than WAL (this never actually worked in practice)
- Replaced old `node-ci` script with `run-in-submodules`, which allows a command to be run in submodules based on matching
  the values in `package.json`.
- Removed `border-bottom` property for `Open Data Quality:` from DatasetSummary/Details page
- Apply Design System skip link/links styles
- Add schema.org/Dataset microdata semantic markup
- Use colours from DTA design guide
- Fixed distribution previews
- Made CSP report uri configurable
- Added stubbed correspondence api
- Added link to publisher page for publisher on dataset summary.
- Recent search will not save "\*" search
- Reduced homepage tagline bottom margin
- Brought back homepage animation
- Chart is available for Non-time series CSV data files now
- Map preview on `nationalmap` will be processed by `MagdaCatalogItem`
- Fixed a few issues with `format-sleuther`
- `format-sleuther` will use accessURL if download URL not available
- `format-sleuther` will recognise `www:download-1.0-http—csiro-oa-app` as `CSIRO Open App`
- `format-sleuther` will recognise `WWW:DOWNLOAD-1.0-http--downloaddata` as `html`
- `MagdaCatalogItem` will use accessURL if download URL not available
- `MagdaCatalogItem` will use `dataset-format` (if available) to determine CatalogItem type
- Added `ESRI REST` (ArcGIS) support to `MapPreview`
- Fixed the GAP under preview map loading box
- Switched to using yarn as the package manager
- Merge duplicate publisher records before display on publisher page
- Made frontend GA post to both terria and dga google analytics.
- Tagged correspondence api as a typescript api.
- Made auto deploy for master -> dev server reconfigure jobs.
- Fixed up docker scripts to make them handle multiple versions of yarn packages coexisting.
- Updated footer with govau design systems components.
- Made magda-web-server look for magda-web-client using require.resolve.
- Added tooltip to future dates on datepicker
- Header adjustment for new design system.
- Updated notification with govau design systems components & fixed a few minor error handling related issues
- Implemented SMTP client with `nodemailer` for correspondence api
- Simplified the way that search queries are sent to elasticsearch and boosted title to higher importance.
- Modified `Show full description` font-size.
- Added `recrawl` API endpoints to sleuther framework
- Added spacing between dataset publisher and created date.
- Fixed up datasets always showing as 0 stars.
- Added bottom margin to all static pages.
- Modified offending CSS properties in `MarkdownViewer`.
- Recent search caches images to avoid flickering icons issue on the first display
- Added standard space in between Download / New tab buttons on `DatasetDetails`.
- Reimplemented links from publisher names to their respective page.
- Make search filters stay on until specifically dismissed
- Added ui-only preview job to gitlab.
- Modified `DatasetSummary` description style to be default `au-body`
- Tweaked `au-btn` border-right to be white for search facets.
- Remove feedback form & button from both desktop & mobile view
- Made all data.gov.au environments use mailgun.
- Map Preview: Set default camera to Australia
- Map Preview: Mute errors from users
- Map Preview: Report selected distribution to console
- Adjusted pagination button styles
- Bumped regions index version to 21 because of region shortname

## 0.0.38

- Use button styles from DTA design guide
- Use grid system from DTA design guide
- Mobile search filter new look
- Feedback CSP endpoint now accepts both `application/csp-report` & `application/json` content-type
- When closed, hamburger menu on mobile switches to a X
- Will Scroll to top of the page when goes from link to link
- Made search filter icons consistent in color when they are applied
- Modified search results `Quality:` text to `Open Data Quality:`
- Removed excess vertical whitespace from hamburger menu
- Dataset page: Change icon for distribution page
- Changed data visualisation table height for either 5 or 10 rows, vertical scroll otherwise.
- DataPreview Table|Chart is hidden if no data is present.
- Empty search won't be saved as recent search item
- Adjust display of feedback link on mobile to be fixed in footer
- Stopped filters from disappearing when search is submitted
- Added loading spinner for preview map and dataset visualisation.
- Adjusted recent search box style
- Added delete button to recent search box
- Same search text with different filters will be considered as same searches
- Fixed an issue that accessURL won't be displayed on distribution page.
- Will not show distribution page if only accessURL is available.
- Handle gracefully when local storage is disabled (for recent search history widget)
- Fixed an issue that registry excludes linking aspects when there are no links
- Visual adjustments on Homepage & dataset page
- Changes on homepage config: different background & lozenge on different day
- Allow turn off homepage stories by set stories field to null
- Remove 'unspecified' item from publisher & format aggregation
- Added file icon hover tooltip on dataset page
- Brought back mobile version home page story style to avoid being run into each other
- Updated text for homepage articles.
- Update Privacy/About/Data Rating pages
- Updated SEO-friendliness of various headings (h3->h2)
- Display all publishers and hide search on publishers page
- Added `margin-bottom` spacing for footer links on mobile.
- Removed `box-shadow` style from selected search facets buttons
- Hide the \* when I click on the Dataset link in header or click through from a Publisher
- If format info is available from sleuther, format sleuther info should be used
- Enable homepage stories and updated homepage config
- Upgraded TerriaJs to 5.7.0 to fix the issue with previewing certain datasets
- Created `ISSUE_TEMPLATE.md` file
- Stopped user feedback from being duplicated
- Useless patch request to registry API should not trigger any event creation
- Allow users to select recent search item by arrow keys
- Add 3 more government CSW services
- Hide feedback form from mobile view
- Upgraded React and associates to v16.3
- Ensured scroll bars are shown on Chrome/Webkit except on search facet autocomplete lists
- Fixed an issue that users may see an error after page 4
- Fixed an issue that prevents users from searching current search text by clicking search button or pressing enter key
- keep distance between search box and the first story on mobile view
- Fixed an issue search may not be added to recent search list in some cases
- Make small position adjustment to the recent search icon
- Moved homepage config from S3 to local
- Added spacing between download & new tab button on dataset page
- Added spacing on byline of dataset page
- Made data quality rating use stars across search results and quality page, and made both use quality aspect.
- Fix placement and color of search box on desktop and mobile
- Stopped relying on visualisation minion to process a file before visualising the file as a chart

## 0.0.37

- Make search filter lozenges wrap when too long
- Hide created and updated dates if dates are not available
- Update email address for feedback including in map preview errors
- Make facets stack on mobile
- Use params q= 'xxx' to persist the search text in search page, dataset page and distribution pages
- Added Download button/link click tracking via Google Analytics
- Add CircleCI configuration to automatically build and deploy the public web interface
- Hid `Projects` on header
- Added recent searches function
- Extend eslint ruleset to enforce the use of the prettier tool
- Upgrade public web interface (but not preview map) to React 16
- Set `node-sass` (required by magda-web-client) version to `4.8.1` to solve lerna bootstrap 404 error.
- Added dataset quality page
- Added `Powered by Magda` footer link
- Modified `API Docs` footer link to use HTTPS
- Modified .vscode/settings to hide ALL `.css` files in @magda-web-client.
- Added Rollbar exception reporting for client side javascript
- Added IE9/10 polyfills so that the upgrade-your-browser message comes up
- Added a development unauthenticated API proxy for testing without CORS problems
- Updated date display format on search page
- Added Slash between created and updated date on dataset page
- Added in quality indicator tooltip for dataset lists
- Added new window link to Data61 from the "Developed by `data61-logo`" in footer.
- Added tooltip to search icon
- Hid download button on dataset page when download url is not available
- Updated footer links and layout
- Fixed an issue that prevents csv-geo-au data source to be opened in national map
- responsive background image for homepage
- Hidden top `go back to old site` for mobile views
- New Homepage Design except stories
- Open in National Map button now send config via postMessage (except IE <=11)
- Fixed web-server crash in in kubernete pod
- Removed query language from search api
- Stopped elasticsearch automatically creating indexes.
- Stopped recent searches showing "\*" as a dot
- Made recent searches work from parts deeper than `/`
- Brought back recent search feature to new home design & implemented the new design
- Added the data.gov.au s3 bucket to allow script sources
- Removed API docs from footer temporarily
- Changed "request dataset" link in footer to a mailto link
- Added the data.gov.au s3 bucket to allowed script sources
- Added feedback uri to server config.
- Modified search results `Quality:` text to `Open Data Quality:`
- Added eslint to travis build
- Fixed search.data.gov.au-specific problem where directing back to data.gov.au would cause an redirect back to search.data.gov.au

## 0.0.36

- Fixed a bug that stopped datasets with URL reserved characters in their id from being viewed.
- Map Previewer will select WMS data source by default (if available) for better big data handling

## 0.0.35

- Fixed preview map data loading issue: replaced dev site url
- Fixed `third-party.js` url in homepage

## 0.0.34

- Added +x permissions to docker image scripts that didn't have them.
- Fixed bug where navigation buttons were reversed in the new search results page.
- Added support to search for regions in the location filter by a short name and configured STE state regions to allow searching by acronym
- Map previewer will pick data distribution with best support for a dataset
- Map previewer will communicate with TerriaJs via `postMessage` rather than url
- Default map for map previewer has been changed to `Positron (Light)`
- Implement new dataset page design. Brought back Map previewer & Charter previewer.
- Added `onLoadingStart` & `onLoadingEnd` event handlers to the `DataPreviewMap` component of `magda-web-client` module.
- Made a click on the "Go back" link on the banner tag the user with a `noPreview` cookie for VWO to pick up on.
- Added request logging to `magda-web-server`.
- Added liveness probes to all helm services.
- Added a CSP and HSTS to magda web.
- Added default Cache-Control header to GET requests that go through the gateway.
- Fixed build process to produce minified release version of TerriaMap instead of dev version.
- Added robots.txt
- Minor visual adjustment based on Tash's feedback

## 0.0.33

- Added ability to get records from the registry by the value of their aspects.
- Set `kubernetes-client` (required by magda-admin-api) version to `3.17.2` to solve a travis build issue
- Stopped the registry api from timing out and returning an error code when trimming by source tag / id - now returns 202 if it takes too long.
- Added route for `/pages/*` requests so that `magda-web-server` won't response `Cannot GET /page/*`
- Added format sleuther
- Set `kubernetes-client` (required by magda-admin-api) version to `3.17.2` to solve the travis build issue.
- Added ability to get records from the registry by the value of their aspects.
- Added access control layer to Authorization APIs: All `private` APIs (uri starts with /private/) can only be accessed by Admin users.
- Auth API will return `401` status code for un-authorized users and `403` if the APIs require `admin` level access
- Added test cases for ApiClient class
- Added test cased for Authorization APIs
- Fixed minor frontend issue when Authorization APIs return non-json response
- Updated visualization sleuther to stream file downloads and csv parsing, and relax time field specifications.
- Added `userId` parameter to `package.json` of `magda-gateway` module
- Added execution permission to `setup.sh` to solve the issue that `magda-elastic-search` failed to start in minikube
- Updated format sleuther to be a bit more optimistic in its sleuthing
- Re-added viz sleuther to default helm config
- Added index to `"publisher"` field in recordaspects table in order to stop indexer webhook queries taking 10 minutes.
- Added a CONTRIBUTING.md file
- Fixed an issue that `Preview Map` doesn't support WFS API
- Made the indexer listen to delete record events and remove the deleted record from the index
- Added prettier `pre-commit` hook to make sure consistent code style
- Formatted existing typescript source code using `prettier`
- Updated `building-and-running.md`
- Added preview map support for geojson data type
- Merged latest changes (commits on or before 1st Feb 2018) from TerriaMap to `magda-preview-map` module
- Map previewer will zoom to dataset (except KML data)
- Removed `year` facet from search results, replaced it with a temporal field with earliest and latest dates in search results.
- Added Google Analytics Tag Manager Code / VWO code to `<head>`
- Added `feedback-api` microservice to collect feedback and create GitHub issues from it.
- Duplicated tags with different cases are now merged (at frontend)
- Tags contain possible separators (i.e. , ; | or /) are now split into shorter tags (at frontend)
- Separated database migrations from database images to facilitate use of managed SQL services - they now live in `magda-migrator-xx` directories and run as jobs on helm upgrade/install
- Added configuration for Google Cloud SQL
- Normalised DB names - now everything is magda-xx-db
- Made docker build scripts automatically adjust `FROM` statements to add `localhost:5000/` and the correct version tag where necessary
- Made datasets with years < 1000 AD index as being from the year 2xxx, as all that we've seen are typos so far.
- Changes on feedback form: Added (\*) to `Email` & `Feedback` fields heading. Added tooltip to display the validation error.
- Changes on feedback form: the distance between right border of the feedback form and browser window should be the same as the bottom border.

## 0.0.32

- Connectors now create organizations, datasets, and distributions with IDs prefixed by the type of record and by the ID of the connector. For example, `org-bom-Australian Bureau of Meteorology` is the organization with the ID `Australian Bureau of Meteorology` from the connector with ID `bom`. Other type prefixes are `ds` for dataset and `dist` for distribution. This change avoids conflicting IDs from different sources.
- Fixed a race condition in the registry that could lead to an error when multiple requests tried to create/update the same record simultaneously, which is fairly common when creating organizations in the CSW connector.
- Updated hooks so that each hook when running can skip over irrelevant events
- Made sure hook processing resumes when either the registry or the sleuther wakes back up.
- SA1 regions are no longer named after the SA2 region that contains them, reducing noise in the region search results. To find an actual SA1, users will need to search for its ID.
- The broken link sleuther now has its retry count for external links configurable separately to the retry count for contacting the registry, with a default of 3.
- Connectors now tag datasets that they've created with a `sourcetag` attribute - at the end of a crawl, they delete all records that were created by them without the latest `sourceTag`.
- Optimised the query that finds new events for each webhook
- Stopped async webhooks posting `success: false` on an uncaught failure, as this just causes them to process the same data and fail over and over.
- Stopped the broken link sleuther from failing completely when it gets a string that isn't a valid URL - now records as "broken".
