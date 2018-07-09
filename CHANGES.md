## 0.0.44

-   Removed `button` element for distribution download link on dataset page.
-   Updated documentation for setting up `Docker Edge` for Kubernetes.
-   Modified error message text and omitted homepage articles if search error occurs.
-   Changed chart icons on dataset page
-   Made `elasticsearch` supports synonyms
-   Upgraded `elasticsearch` to v6.3.0
-   Enable organisation search
-   Disabled scroll to zoom on dataset preview map until map is clicked on and added terria zoom controls to preview map
-   Change appearance of mobile search box
-   Improve filter button icon alignment
-   adjust dataset page layout to accomodate new mobile design
-   Disable /auth route in production & change gateway health checking endpoint to /v0/healthz
-   Stopped indexer skipping datasets that have no distributions. These datasets can now be discovered via search.
-   Fixed `Ask a question about this dataset` button (on dataset page) won't open form on safari browser
-   Remove input content from Scala service Malformat query parameter error message
-   Improved mobile navigation
-   Improved dataset page paddings and margins
-   Moved express helmet to gateway module
-   Make chart title wrap
-   Default button color fix

## 0.0.43

-   Fix design system react import for SASS overrides
-   Add breadcrumb for dataset page and distribution page
-   Added further styling filters to coverup markdown rendering on dataset pages
-   Added UNSAFE\_ annotations or refactored to prepare for [React async rendering](https://reactjs.org/blog/2018/03/27/update-on-async-rendering.html).
-   Hide zendesk floating feedback button on mobile
-   Modified the look and layout of the distribution pages.
-   Made close button on suggest form rounded and thicker
-   Location and Date filters can be applied by clicking outside of the box
-   Changed registry /records api `pageToken` as long type parameter to avoid runtime error
-   Improved mobile responsiveness on dataset and search results page
-   Updated homepage tagline.
-   Upgraded `basemaps.cartocdn.com` url to HTTPS.
-   Upgraded `rollbar.js` 2.3.9 -> 2.4.1
-   Added community link to header
-   Map filter clear button only active when region is selected
-   Fixed a bug in search filter that makes filters irresponsible
-   Fixed a bug on not able to get correct distribution and blank dataset title in breadcrumb
-   Changed chart icons on dataset page
-   Fixed: Enter a dataset page with `*` query string will see a blank page
-   Fixed: when checking if fetch is required, dataset id from url params need to be decoded
-   Enable organisation search

## 0.0.42

-   Implemented the new pagination design
-   remove border for basal button style to prevent duplication
-   Use http://colorbrewer2.org/#type=sequential&scheme=BuPu&n=3 for data vis palette
-   Do not load preview map on mobile, give user option to view in national map instead
-   Added redirect for CKAN dataset URLs (UUID or slug) to their new canonical location
-   Fixed pagination bar shows incorrect result count
-   Added Zendesk feedback widget activated via footer link
-   Made end of content spacing consistent
-   Added `flex` display and set consistent padding from footer.
-   Added filter count to search results
-   Made filter selections move only when applied on publisher and format
-   reset pagination on query change
-   Removed underline from organisations in search
-   Modified styling for `ask a question` button to use secondary AUButton styling.
-   Restricted markdown <strong> tag to be default style.
-   Added `bottom-border` property to make dataset filters stand out more.
-   Fixed page refresh when using a dataset tag as a link.
-   Replaced underscores with spaces on distribution links, making them wrap on mobile
-   Improved modal design on report/ask a question on a dataset
-   Removed `totalCount` field from registry api pagination objects.
-   Added `/count` endpoint to registry api
-   Set default quality to 0 when indexing
-   Use Async appender for logback logging
-   Removed logging to file
-   Akka logging setting adjustment
-   Made publisher and format filter search use the search backend instead of client-side autocomplete.
-   Updated data quality explanation
-   Made go-to-external-distribution button into an <a> tag instead of a javascript button.
-   Update some results found message

## 0.0.41

-   Create Suggest a Dataset Page
-   Add Suggest a Dataset on search results page
-   Fixed display of chart axis config dropdowns in Firefox.
-   Fixed LanguageAnalyzerSpec from generating stop words as search values.
-   Updated prettier config to not reformat package.json in to an invalid 4 space tab width.
-   Positioned the buttons & format icons at middle position of the Files & APIs section
-   Made publisher acronym search case insensitive & added test cases
-   Added vertical spacing for `DataPreview` chart fields.
-   Added file icon and divider to search results
-   Stopped format/publisher filter search returning wrong doc counts when there's no text query.
-   Fixed a issue that state region layer could be removed from region filter panel map
-   Adjust search box placeholder color to be more visible on mobile and more consistent on desktop
-   Corrected email template style to be inline with designs.
-   Switched development/preview to use let's encrypt certificates for HTTPS.

## 0.0.40

-   Changed Publishers to Organisations in UI
-   Modified `MonthPicker` tooltip icon's right padding
-   Location filter: Make state selectable on the inital region filter panel open
-   Made region and dataset configurable in search api.
-   Added publisher name acronyms to elasticsearch
-   Removed underline on coat of arms.
-   Implemented `Tooltip` component to replace `react-tooltip` from `QualityIndicator`
-   Made region and dataset configurable in search api.
-   Fixed open in national map button not send correct URL

## 0.0.39

-   implemented new UI palette with accessibility improvements
-   remove MUI
-   remove /contact page as it duplicates functions of feedback form
-   Use DTA design system for Feedback form
-   Use DTA design system for all form elements
-   Changed linked data rating sleuther to `PUT` instead of `PATCH` data quality aspect
-   Made linked data rating sleuther take output of broken link sleuther into account
-   Removed datasetQualityAspectDef from sleuther-broken-link
-   Update the look of facet searchbox to be consistent with DTA design system
-   Mobile Aus Gov logo links to homepage
-   Change the tag type of the background link on the homepage in order to correct the page refreshing when it shouldn't
-   Added gitlab CI build config
-   Fixed indexer's ability to make/retrieve ES backups
-   Added ability for magda-postgres to retrieve WAL backup as "immediate" rather than catching all the way up with the WAL log.
-   Removed implied ability for magda postgres to use a backup method other than WAL (this never actually worked in practice)
-   Replaced old `node-ci` script with `run-in-submodules`, which allows a command to be run in submodules based on matching
    the values in `package.json`.
-   Removed `border-bottom` property for `Open Data Quality:` from DatasetSummary/Details page
-   Apply Design System skip link/links styles
-   Add schema.org/Dataset microdata semantic markup
-   Use colours from DTA design guide
-   Fixed distribution previews
-   Made CSP report uri configurable
-   Added stubbed correspondence api
-   Added link to publisher page for publisher on dataset summary.
-   Recent search will not save "\*" search
-   Reduced homepage tagline bottom margin
-   Brought back homepage animation
-   Chart is available for Non-time series CSV data files now
-   Map preview on `nationalmap` will be processed by `MagdaCatalogItem`
-   Fixed a few issues with `format-sleuther`
-   `format-sleuther` will use accessURL if download URL not available
-   `format-sleuther` will recognise `www:download-1.0-http—csiro-oa-app` as `CSIRO Open App`
-   `format-sleuther` will recognise `WWW:DOWNLOAD-1.0-http--downloaddata` as `html`
-   `MagdaCatalogItem` will use accessURL if download URL not available
-   `MagdaCatalogItem` will use `dataset-format` (if available) to determine CatalogItem type
-   Added `ESRI REST` (ArcGIS) support to `MapPreview`
-   Fixed the GAP under preview map loading box
-   Switched to using yarn as the package manager
-   Merge duplicate publisher records before display on publisher page
-   Made frontend GA post to both terria and dga google analytics.
-   Tagged correspondence api as a typescript api.
-   Made auto deploy for master -> dev server reconfigure jobs.
-   Fixed up docker scripts to make them handle multiple versions of yarn packages coexisting.
-   Updated footer with govau design systems components.
-   Made magda-web-server look for magda-web-client using require.resolve.
-   Added tooltip to future dates on datepicker
-   Header adjustment for new design system.
-   Updated notification with govau design systems components & fixed a few minor error handling related issues
-   Implemented SMTP client with `nodemailer` for correspondence api
-   Simplified the way that search queries are sent to elasticsearch and boosted title to higher importance.
-   Modified `Show full description` font-size.
-   Added `recrawl` API endpoints to sleuther framework
-   Added spacing between dataset publisher and created date.
-   Fixed up datasets always showing as 0 stars.
-   Added bottom margin to all static pages.
-   Modified offending CSS properties in `MarkdownViewer`.
-   Recent search caches images to avoid flickering icons issue on the first display
-   Added standard space in between Download / New tab buttons on `DatasetDetails`.
-   Reimplemented links from publisher names to their respective page.
-   Make search filters stay on until specifically dismissed
-   Added ui-only preview job to gitlab.
-   Modified `DatasetSummary` description style to be default `au-body`
-   Tweaked `au-btn` border-right to be white for search facets.
-   Remove feedback form & button from both desktop & mobile view
-   Made all data.gov.au environments use mailgun.
-   Map Preview: Set default camera to Australia
-   Map Preview: Mute errors from users
-   Map Preview: Report selected distribution to console
-   Adjusted pagination button styles
-   Bumped regions index version to 21 because of region shortname

## 0.0.38

-   Use button styles from DTA design guide
-   Use grid system from DTA design guide
-   Mobile search filter new look
-   Feedback CSP endpoint now accepts both `application/csp-report` & `application/json` content-type
-   When closed, hamburger menu on mobile switches to a X
-   Will Scroll to top of the page when goes from link to link
-   Made search filter icons consistent in color when they are applied
-   Modified search results `Quality:` text to `Open Data Quality:`
-   Removed excess vertical whitespace from hamburger menu
-   Dataset page: Change icon for distribution page
-   Changed data visualisation table height for either 5 or 10 rows, vertical scroll otherwise.
-   DataPreview Table|Chart is hidden if no data is present.
-   Empty search won't be saved as recent search item
-   Adjust display of feedback link on mobile to be fixed in footer
-   Stopped filters from disappearing when search is submitted
-   Added loading spinner for preview map and dataset visualisation.
-   Adjusted recent search box style
-   Added delete button to recent search box
-   Same search text with different filters will be considered as same searches
-   Fixed an issue that accessURL won't be displayed on distribution page.
-   Will not show distribution page if only accessURL is available.
-   Handle gracefully when local storage is disabled (for recent search history widget)
-   Fixed an issue that registry excludes linking aspects when there are no links
-   Visual adjustments on Homepage & dataset page
-   Changes on homepage config: different background & lozenge on different day
-   Allow turn off homepage stories by set stories field to null
-   Remove 'unspecified' item from publisher & format aggregation
-   Added file icon hover tooltip on dataset page
-   Brought back mobile version home page story style to avoid being run into each other
-   Updated text for homepage articles.
-   Update Privacy/About/Data Rating pages
-   Updated SEO-friendliness of various headings (h3->h2)
-   Display all publishers and hide search on publishers page
-   Added `margin-bottom` spacing for footer links on mobile.
-   Removed `box-shadow` style from selected search facets buttons
-   Hide the \* when I click on the Dataset link in header or click through from a Publisher
-   If format info is available from sleuther, format sleuther info should be used
-   Enable homepage stories and updated homepage config
-   Upgraded TerriaJs to 5.7.0 to fix the issue with previewing certain datasets
-   Created `ISSUE_TEMPLATE.md` file
-   Stopped user feedback from being duplicated
-   Useless patch request to registry API should not trigger any event creation
-   Allow users to select recent search item by arrow keys
-   Add 3 more government CSW services
-   Hide feedback form from mobile view
-   Upgraded React and associates to v16.3
-   Ensured scroll bars are shown on Chrome/Webkit except on search facet autocomplete lists
-   Fixed an issue that users may see an error after page 4
-   Fixed an issue that prevents users from searching current search text by clicking search button or pressing enter key
-   keep distance between search box and the first story on mobile view
-   Fixed an issue search may not be added to recent search list in some cases
-   Make small position adjustment to the recent search icon
-   Moved homepage config from S3 to local
-   Added spacing between download & new tab button on dataset page
-   Added spacing on byline of dataset page
-   Made data quality rating use stars across search results and quality page, and made both use quality aspect.
-   Fix placement and color of search box on desktop and mobile

## 0.0.37

-   Make search filter lozenges wrap when too long
-   Hide created and updated dates if dates are not available
-   Update email address for feedback including in map preview errors
-   Make facets stack on mobile
-   Use params q= 'xxx' to persist the search text in search page, dataset page and distribution pages
-   Added Download button/link click tracking via Google Analytics
-   Add CircleCI configuration to automatically build and deploy the public web interface
-   Hid `Projects` on header
-   Added recent searches function
-   Extend eslint ruleset to enforce the use of the prettier tool
-   Upgrade public web interface (but not preview map) to React 16
-   Set `node-sass` (required by magda-web-client) version to `4.8.1` to solve lerna bootstrap 404 error.
-   Added dataset quality page
-   Added `Powered by Magda` footer link
-   Modified `API Docs` footer link to use HTTPS
-   Modified .vscode/settings to hide ALL `.css` files in @magda-web-client.
-   Added Rollbar exception reporting for client side javascript
-   Added IE9/10 polyfills so that the upgrade-your-browser message comes up
-   Added a development unauthenticated API proxy for testing without CORS problems
-   Updated date display format on search page
-   Added Slash between created and updated date on dataset page
-   Added in quality indicator tooltip for dataset lists
-   Added new window link to Data61 from the "Developed by `data61-logo`" in footer.
-   Added tooltip to search icon
-   Hid download button on dataset page when download url is not available
-   Updated footer links and layout
-   Fixed an issue that prevents csv-geo-au data source to be opened in national map
-   responsive background image for homepage
-   Hidden top `go back to old site` for mobile views
-   New Homepage Design except stories
-   Open in National Map button now send config via postMessage (except IE <=11)
-   Fixed web-server crash in in kubernete pod
-   Removed query language from search api
-   Stopped elasticsearch automatically creating indexes.
-   Stopped recent searches showing "\*" as a dot
-   Made recent searches work from parts deeper than `/`
-   Brought back recent search feature to new home design & implemented the new design
-   Added the data.gov.au s3 bucket to allow script sources
-   Removed API docs from footer temporarily
-   Changed "request dataset" link in footer to a mailto link
-   Added the data.gov.au s3 bucket to allowed script sources
-   Added feedback uri to server config.
-   Modified search results `Quality:` text to `Open Data Quality:`
-   Added eslint to travis build
-   Fixed search.data.gov.au-specific problem where directing back to data.gov.au would cause an redirect back to search.data.gov.au

## 0.0.36

-   Fixed a bug that stopped datasets with URL reserved characters in their id from being viewed.
-   Map Previewer will select WMS data source by default (if available) for better big data handling

## 0.0.35

-   Fixed preview map data loading issue: replaced dev site url
-   Fixed `third-party.js` url in homepage

## 0.0.34

-   Added +x permissions to docker image scripts that didn't have them.
-   Fixed bug where navigation buttons were reversed in the new search results page.
-   Added support to search for regions in the location filter by a short name and configured STE state regions to allow searching by acronym
-   Map previewer will pick data distribution with best support for a dataset
-   Map previewer will communicate with TerriaJs via `postMessage` rather than url
-   Default map for map previewer has been changed to `Positron (Light)`
-   Implement new dataset page design. Brought back Map previewer & Charter previewer.
-   Added `onLoadingStart` & `onLoadingEnd` event handlers to the `DataPreviewMap` component of `magda-web-client` module.
-   Made a click on the "Go back" link on the banner tag the user with a `noPreview` cookie for VWO to pick up on.
-   Added request logging to `magda-web-server`.
-   Added liveness probes to all helm services.
-   Added a CSP and HSTS to magda web.
-   Added default Cache-Control header to GET requests that go through the gateway.
-   Fixed build process to produce minified release version of TerriaMap instead of dev version.
-   Added robots.txt
-   Minor visual adjustment based on Tash's feedback

## 0.0.33

-   Added ability to get records from the registry by the value of their aspects.
-   Set `kubernetes-client` (required by magda-admin-api) version to `3.17.2` to solve a travis build issue
-   Stopped the registry api from timing out and returning an error code when trimming by source tag / id - now returns 202 if it takes too long.
-   Added route for `/pages/*` requests so that `magda-web-server` won't response `Cannot GET /page/*`
-   Added format sleuther
-   Set `kubernetes-client` (required by magda-admin-api) version to `3.17.2` to solve the travis build issue.
-   Added ability to get records from the registry by the value of their aspects.
-   Added access control layer to Authorization APIs: All `private` APIs (uri starts with /private/) can only be accessed by Admin users.
-   Auth API will return `401` status code for un-authorized users and `403` if the APIs require `admin` level access
-   Added test cases for ApiClient class
-   Added test cased for Authorization APIs
-   Fixed minor frontend issue when Authorization APIs return non-json response
-   Updated visualization sleuther to stream file downloads and csv parsing, and relax time field specifications.
-   Added `userId` parameter to `package.json` of `magda-gateway` module
-   Added execution permission to `setup.sh` to solve the issue that `magda-elastic-search` failed to start in minikube
-   Updated format sleuther to be a bit more optimistic in its sleuthing
-   Re-added viz sleuther to default helm config
-   Added index to `"publisher"` field in recordaspects table in order to stop indexer webhook queries taking 10 minutes.
-   Added a CONTRIBUTING.md file
-   Fixed an issue that `Preview Map` doesn't support WFS API
-   Made the indexer listen to delete record events and remove the deleted record from the index
-   Added prettier `pre-commit` hook to make sure consistent code style
-   Formatted existing typescript source code using `prettier`
-   Updated `building-and-running.md`
-   Added preview map support for geojson data type
-   Merged latest changes (commits on or before 1st Feb 2018) from TerrisMap to `magda-preview-map` module
-   Map previewer will zoom to dataset (except KML data)
-   Removed `year` facet from search results, replaced it with a temporal field with earliest and latest dates in search results.
-   Added Google Analytics Tag Manager Code / VWO code to `<head>`
-   Added `feedback-api` microservice to collect feedback and create GitHub issues from it.
-   Duplicated tags with different cases are now merged (at frontend)
-   Tags contain possible separators (i.e. , ; | or /) are now split into shorter tags (at frontend)
-   Separated database migrations from database images to facilitate use of managed SQL services - they now live in `magda-migrator-xx` directories and run as jobs on helm upgrade/install
-   Added configuration for Google Cloud SQL
-   Normalised DB names - now everything is magda-xx-db
-   Made docker build scripts automatically adjust `FROM` statements to add `localhost:5000/` and the correct version tag where necessary
-   Made datasets with years < 1000 AD index as being from the year 2xxx, as all that we've seen are typos so far.
-   Changes on feedback form: Added (\*) to `Email` & `Feedback` fields heading. Added tooltip to display the validation error.
-   Changes on feedback form: the distance between right border of the feedback form and browser window should be the same as the bottom border.

## 0.0.32

-   Connectors now create organizations, datasets, and distributions with IDs prefixed by the type of record and by the ID of the connector. For example, `org-bom-Australian Bureau of Meteorology` is the organization with the ID `Australian Bureau of Meteorology` from the connector with ID `bom`. Other type prefixes are `ds` for dataset and `dist` for distribution. This change avoids conflicting IDs from different sources.
-   Fixed a race condition in the registry that could lead to an error when multiple requests tried to create/update the same record simultaneously, which is fairly common when creating organizations in the CSW connector.
-   Updated hooks so that each hook when running can skip over irrelevant events
-   Made sure hook processing resumes when either the registry or the sleuther wakes back up.
-   SA1 regions are no longer named after the SA2 region that contains them, reducing noise in the region search results. To find an actual SA1, users will need to search for its ID.
-   The broken link sleuther now has its retry count for external links configurable separately to the retry count for contacting the registry, with a default of 3.
-   Connectors now tag datasets that they've created with a `sourcetag` attribute - at the end of a crawl, they delete all records that were created by them without the latest `sourceTag`.
-   Optimised the query that finds new events for each webhook
-   Stopped async webhooks posting `success: false` on an uncaught failure, as this just causes them to process the same data and fail over and over.
-   Stopped the broken link sleuther from failing completely when it gets a string that isn't a valid URL - now records as "broken".
