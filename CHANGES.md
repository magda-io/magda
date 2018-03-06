## 0.0.34
* Map previewer will pick data distribution with best support for a dataset
* Map previewer will communicate with TerriaJs via `postMessage` rather than url
* Default map for map previewer has been changed to `Positron (Light)`
* Implement new dataset page design. Brought back Map previewer & Charter previewer.
* Made a click on the "Go back" link on the banner tag the user with a `noPreview` cookie for VWO to pick up on.

## 0.0.33

* Added ability to get records from the registry by the value of their aspects.
* Set `kubernetes-client` (required by magda-admin-api) version to `3.17.2` to solve a travis build issue
* Stopped the registry api from timing out and returning an error code when trimming by source tag / id - now returns 202 if it takes too long.
* Added route for `/pages/*` requests so that `magda-web-server` won't response `Cannot GET /page/*`
* Added format sleuther
* Set `kubernetes-client` (required by magda-admin-api) version to `3.17.2` to solve the travis build issue.
* Added ability to get records from the registry by the value of their aspects.
* Added access control layer to Authorization APIs: All `private` APIs (uri starts with /private/) can only be accessed by Admin users.
* Auth API will return `401` status code for un-authorized users and `403` if the APIs require `admin` level access
* Added test cases for ApiClient class
* Added test cased for Authorization APIs
* Fixed minor frontend issue when Authorization APIs return non-json response
* Updated visualization sleuther to stream file downloads and csv parsing, and relax time field specifications.
* Added `userId` parameter to `package.json` of `magda-gateway` module
* Added execution permission to `setup.sh` to solve the issue that `magda-elastic-search` failed to start in minikube
* Updated format sleuther to be a bit more optimistic in its sleuthing
* Re-added viz sleuther to default helm config
* Added index to `"publisher"` field in recordaspects table in order to stop indexer webhook queries taking 10 minutes.
* Added a CONTRIBUTING.md file
* Fixed an issue that `Preview Map` doesn't support WFS API
* Made the indexer listen to delete record events and remove the deleted record from the index
* Added prettier `pre-commit` hook to make sure consistent code style
* Formatted existing typescript source code using `prettier`
* Updated `building-and-running.md`
* Added preview map support for geojson data type
* Merged latest changes (commits on or before 1st Feb 2018) from TerrisMap to `magda-preview-map` module
* Map previewer will zoom to dataset (except KML data)
* Removed `year` facet from search results, replaced it with a temporal field with earliest and latest dates in search results.
* Added Google Analytics Tag Manager Code / VWO code to `<head>`
* Added `feedback-api` microservice to collect feedback and create GitHub issues from it.
* Duplicated tags with different cases are now merged (at frontend)
* Tags contain possible separators (i.e. , ; | or /) are now split into shorter tags (at frontend)
* Separated database migrations from database images to facilitate use of managed SQL services - they now live in `magda-migrator-xx` directories and run as jobs on helm upgrade/install
* Added configuration for Google Cloud SQL
* Normalised DB names - now everything is magda-xx-db
* Made docker build scripts automatically adjust `FROM` statements to add `localhost:5000/` and the correct version tag where necessary
* Made datasets with years < 1000 AD index as being from the year 2xxx, as all that we've seen are typos so far.
* Changes on feedback form: Added (\*) to `Email` & `Feedback` fields heading. Added tooltip to display the validation error.
* Changes on feedback form: the distance between right border of the feedback form and browser window should be the same as the bottom border.

## 0.0.32

* Connectors now create organizations, datasets, and distributions with IDs prefixed by the type of record and by the ID of the connector. For example, `org-bom-Australian Bureau of Meteorology` is the organization with the ID `Australian Bureau of Meteorology` from the connector with ID `bom`. Other type prefixes are `ds` for dataset and `dist` for distribution. This change avoids conflicting IDs from different sources.
* Fixed a race condition in the registry that could lead to an error when multiple requests tried to create/update the same record simultaneously, which is fairly common when creating organizations in the CSW connector.
* Updated hooks so that each hook when running can skip over irrelevant events
* Made sure hook processing resumes when either the registry or the sleuther wakes back up.
* SA1 regions are no longer named after the SA2 region that contains them, reducing noise in the region search results. To find an actual SA1, users will need to search for its ID.
* The broken link sleuther now has its retry count for external links configurable separately to the retry count for contacting the registry, with a default of 3.
* Connectors now tag datasets that they've created with a `sourcetag` attribute - at the end of a crawl, they delete all records that were created by them without the latest `sourceTag`.
* Optimised the query that finds new events for each webhook
* Stopped async webhooks posting `success: false` on an uncaught failure, as this just causes them to process the same data and fail over and over.
* Stopped the broken link sleuther from failing completely when it gets a string that isn't a valid URL - now records as "broken".
