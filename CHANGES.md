## 0.0.38

*   Use grid system from DTA design guide
*   Mobile search filter new look
*   Feedback CSP endpoint now accepts both `application/csp-report` & `application/json` content-type
*   When closed, hamburger menu on mobile switches to a X
*   Will Scroll to top of the page when goes from link to link
*   Made search filter icons consistent in color when they are applied
*   Modified search results `Quality:` text to `Open Data Quality:`
*   Removed excess vertical whitespace from hamburger menu
*   Dataset page: Change icon for distribution page
*   Changed data visualisation table height for either 5 or 10 rows, vertical scroll otherwise.
*   DataPreview Table|Chart is hidden if no data is present.
*   Empty search won't be saved as recent search item
*   Adjust display of feedback link on mobile to be fixed in footer
*   Stopped filters from disappearing when search is submitted
*   Added loading spinner for preview map and dataset visualisation.
*   Adjusted recent search box style
*   Added delete button to recent search box
*   Same search text with different filters will be considered as same searches
*   Fixed an issue that accessURL won't be displayed on distribution page.
*   Will not show distribution page if only accessURL is available.
*   Handle gracefully when local storage is disabled (for recent search history widget)
*   Fixed an issue that registry excludes linking aspects when there are no links
*   Visual adjustments on Homepage & dataset page
*   Changes on homepage config: different background & lozenge on different day
*   Allow turn off homepage stories by set stories field to null
*   Remove 'unspecified' item from publisher & format aggregation
*   Added file icon hover tooltip on dataset page
*   Brought back mobile version home page story style to avoid being run into each other
*   Updated text for homepage articles.
*   Update Privacy/About/Data Rating pages
*   Updated SEO-friendliness of various headings (h3->h2)
*   Display all publishers and hide search on publishers page
*   Added `margin-bottom` spacing for footer links on mobile.
*   Removed `box-shadow` style from selected search facets buttons
*   Hide the \* when I click on the Dataset link in header or click through from a Publisher
*   If format info is available from sleuther, format sleuther info should be used
*   Enable homepage stories and updated homepage config
*   Upgraded TerriaJs to 5.7.0 to fix the issue with previewing certain datasets
*   Created `ISSUE_TEMPLATE.md` file
*   Useless patch request to registry API should not trigger any event creation
*   Allow users to select recent search item by arrow keys
*   Add 3 more government CSW services
*   Hide feedback form from mobile view
*   Upgraded React and associates to v16.3
*   Ensured scroll bars are shown on Chrome/Webkit except on search facet autocomplete lists
*   Fixed an issue that users may see an error after page 4
*   Fixed an issue that prevents users from searching current search text by clicking search button or pressing enter key
*   keep distance between search box and the first story on mobile view
*   Fixed an issue search may not be added to recent search list in some cases
*   Make small position adjustment to the recent search icon
*   Added spacing between download & new tab button on dataset page
*   Added spacing on byline of dataset page
*   Moved homepage config from S3 to local
*   Made data quality rating use stars across search results and quality page, and made both use quality aspect.
*   Fix placement and color of search box on desktop and mobile

## 0.0.37

*   Make search filter lozenges wrap when too long
*   Hide created and updated dates if dates are not available
*   Update email address for feedback including in map preview errors
*   Make facets stack on mobile
*   Use params q= 'xxx' to persist the search text in search page, dataset page and distribution pages
*   Added Download button/link click tracking via Google Analytics
*   Add CircleCI configuration to automatically build and deploy the public web interface
*   Hid `Projects` on header
*   Added recent searches function
*   Extend eslint ruleset to enforce the use of the prettier tool
*   Upgrade public web interface (but not preview map) to React 16
*   Set `node-sass` (required by magda-web-client) version to `4.8.1` to solve lerna bootstrap 404 error.
*   Added dataset quality page
*   Added `Powered by Magda` footer link
*   Modified `API Docs` footer link to use HTTPS
*   Modified .vscode/settings to hide ALL `.css` files in @magda-web-client.
*   Added Rollbar exception reporting for client side javascript
*   Added IE9/10 polyfills so that the upgrade-your-browser message comes up
*   Added a development unauthenticated API proxy for testing without CORS problems
*   Updated date display format on search page
*   Added Slash between created and updated date on dataset page
*   Added in quality indicator tooltip for dataset lists
*   Added new window link to Data61 from the "Developed by `data61-logo`" in footer.
*   Added tooltip to search icon
*   Hid download button on dataset page when download url is not available
*   Updated footer links and layout
*   Fixed an issue that prevents csv-geo-au data source to be opened in national map
*   responsive background image for homepage
*   Hidden top `go back to old site` for mobile views
*   New Homepage Design except stories
*   Open in National Map button now send config via postMessage (except IE <=11)
*   Fixed web-server crash in in kubernete pod
*   Removed query language from search api
*   Stopped elasticsearch automatically creating indexes.
*   Stopped recent searches showing "\*" as a dot
*   Made recent searches work from parts deeper than `/`
*   Brought back recent search feature to new home design & implemented the new design
*   Added the data.gov.au s3 bucket to allow script sources
*   Removed API docs from footer temporarily
*   Changed "request dataset" link in footer to a mailto link
*   Added the data.gov.au s3 bucket to allowed script sources
*   Added feedback uri to server config.
*   Modified search results `Quality:` text to `Open Data Quality:`
*   Added eslint to travis build
*   Fixed search.data.gov.au-specific problem where directing back to data.gov.au would cause an
    redirect back to search.data.gov.au

## 0.0.36

*   Fixed a bug that stopped datasets with URL reserved characters in their id from being viewed.
*   Map Previewer will select WMS data source by default (if available) for better big data handling

## 0.0.35

*   Fixed preview map data loading issue: replaced dev site url
*   Fixed `third-party.js` url in homepage

## 0.0.34

*   Added +x permissions to docker image scripts that didn't have them.
*   Fixed bug where navigation buttons were reversed in the new search results page.
*   Added support to search for regions in the location filter by a short name and configured STE state regions to allow searching by acronym
*   Map previewer will pick data distribution with best support for a dataset
*   Map previewer will communicate with TerriaJs via `postMessage` rather than url
*   Default map for map previewer has been changed to `Positron (Light)`
*   Implement new dataset page design. Brought back Map previewer & Charter previewer.
*   Added `onLoadingStart` & `onLoadingEnd` event handlers to the `DataPreviewMap` component of `magda-web-client` module.
*   Made a click on the "Go back" link on the banner tag the user with a `noPreview` cookie for VWO to pick up on.
*   Added request logging to `magda-web-server`.
*   Added liveness probes to all helm services.
*   Added a CSP and HSTS to magda web.
*   Added default Cache-Control header to GET requests that go through the gateway.
*   Fixed build process to produce minified release version of TerriaMap instead of dev version.
*   Added robots.txt
*   Minor visual adjustment based on Tash's feedback

## 0.0.33

*   Added ability to get records from the registry by the value of their aspects.
*   Set `kubernetes-client` (required by magda-admin-api) version to `3.17.2` to solve a travis build issue
*   Stopped the registry api from timing out and returning an error code when trimming by source tag / id - now returns 202 if it takes too long.
*   Added route for `/pages/*` requests so that `magda-web-server` won't response `Cannot GET /page/*`
*   Added format sleuther
*   Set `kubernetes-client` (required by magda-admin-api) version to `3.17.2` to solve the travis build issue.
*   Added ability to get records from the registry by the value of their aspects.
*   Added access control layer to Authorization APIs: All `private` APIs (uri starts with /private/) can only be accessed by Admin users.
*   Auth API will return `401` status code for un-authorized users and `403` if the APIs require `admin` level access
*   Added test cases for ApiClient class
*   Added test cased for Authorization APIs
*   Fixed minor frontend issue when Authorization APIs return non-json response
*   Updated visualization sleuther to stream file downloads and csv parsing, and relax time field specifications.
*   Added `userId` parameter to `package.json` of `magda-gateway` module
*   Added execution permission to `setup.sh` to solve the issue that `magda-elastic-search` failed to start in minikube
*   Updated format sleuther to be a bit more optimistic in its sleuthing
*   Re-added viz sleuther to default helm config
*   Added index to `"publisher"` field in recordaspects table in order to stop indexer webhook queries taking 10 minutes.
*   Added a CONTRIBUTING.md file
*   Fixed an issue that `Preview Map` doesn't support WFS API
*   Made the indexer listen to delete record events and remove the deleted record from the index
*   Added prettier `pre-commit` hook to make sure consistent code style
*   Formatted existing typescript source code using `prettier`
*   Updated `building-and-running.md`
*   Added preview map support for geojson data type
*   Merged latest changes (commits on or before 1st Feb 2018) from TerrisMap to `magda-preview-map` module
*   Map previewer will zoom to dataset (except KML data)
*   Removed `year` facet from search results, replaced it with a temporal field with earliest and latest dates in search results.
*   Added Google Analytics Tag Manager Code / VWO code to `<head>`
*   Added `feedback-api` microservice to collect feedback and create GitHub issues from it.
*   Duplicated tags with different cases are now merged (at frontend)
*   Tags contain possible separators (i.e. , ; | or /) are now split into shorter tags (at frontend)
*   Separated database migrations from database images to facilitate use of managed SQL services - they now live in `magda-migrator-xx` directories and run as jobs on helm upgrade/install
*   Added configuration for Google Cloud SQL
*   Normalised DB names - now everything is magda-xx-db
*   Made docker build scripts automatically adjust `FROM` statements to add `localhost:5000/` and the correct version tag where necessary
*   Made datasets with years < 1000 AD index as being from the year 2xxx, as all that we've seen are typos so far.
*   Changes on feedback form: Added (\*) to `Email` & `Feedback` fields heading. Added tooltip to display the validation error.
*   Changes on feedback form: the distance between right border of the feedback form and browser window should be the same as the bottom border.

## 0.0.32

*   Connectors now create organizations, datasets, and distributions with IDs prefixed by the type of record and by the ID of the connector. For example, `org-bom-Australian Bureau of Meteorology` is the organization with the ID `Australian Bureau of Meteorology` from the connector with ID `bom`. Other type prefixes are `ds` for dataset and `dist` for distribution. This change avoids conflicting IDs from different sources.
*   Fixed a race condition in the registry that could lead to an error when multiple requests tried to create/update the same record simultaneously, which is fairly common when creating organizations in the CSW connector.
*   Updated hooks so that each hook when running can skip over irrelevant events
*   Made sure hook processing resumes when either the registry or the sleuther wakes back up.
*   SA1 regions are no longer named after the SA2 region that contains them, reducing noise in the region search results. To find an actual SA1, users will need to search for its ID.
*   The broken link sleuther now has its retry count for external links configurable separately to the retry count for contacting the registry, with a default of 3.
*   Connectors now tag datasets that they've created with a `sourcetag` attribute - at the end of a crawl, they delete all records that were created by them without the latest `sourceTag`.
*   Optimised the query that finds new events for each webhook
*   Stopped async webhooks posting `success: false` on an uncaught failure, as this just causes them to process the same data and fail over and over.
*   Stopped the broken link sleuther from failing completely when it gets a string that isn't a valid URL - now records as "broken".
