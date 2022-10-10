# web-server

![Version: 2.1.1](https://img.shields.io/badge/Version-2.1.1-informational?style=flat-square)

A Helm chart for Kubernetes

## Requirements

Kubernetes: `>= 1.14.0-0`

## Values

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| adminApiBaseUrl | string | `nil` |  |
| anonymousUserLandingPage | string | `"/home"` | Specify the landing page uri for anonymous users.  |
| authStatusRefreshInterval | int | `300000` | The interval of UI refresh / refetch user auth status data. Default to 5 mins. |
| authenticatedUserLandingPage | string | `"/home"` | Specify the landing page uri for authenticated users |
| automaticPreviewMaxFileSize | int | `2097152` |  |
| autoscaler.enabled | bool | `false` |  |
| autoscaler.maxReplicas | int | `3` |  |
| autoscaler.minReplicas | int | `1` |  |
| autoscaler.targetCPUUtilizationPercentage | int | `80` |  |
| contentApiBaseUrlInternal | string | `"http://content-api/v0/"` |  |
| custodianOrgLevel | int | `2` |  |
| datasetThemes | list | `[]` |  |
| dateConfig.dateFormats[0] | string | `"YYYY"` |  |
| dateConfig.dateFormats[1] | string | `"YYYY-MM"` |  |
| dateConfig.dateFormats[2] | string | `"DD-MM-YYYY"` |  |
| dateConfig.dateFormats[3] | string | `"MM-DD-YYYY"` |  |
| dateConfig.dateFormats[4] | string | `"YYYY-MM-DD"` |  |
| dateConfig.dateFormats[5] | string | `"YYYY-MM-DDThh:mmTZD"` |  |
| dateConfig.dateFormats[6] | string | `"YYYY-MM-DDThh:mm:ssTZD"` |  |
| dateConfig.dateFormats[7] | string | `"YYYY-MM-DDThh:mm:ss.sTZD"` |  |
| dateConfig.dateFormats[8] | string | `"DD-MMM-YYYY"` |  |
| dateConfig.dateFormats[9] | string | `"MMM-DD-YYYY"` |  |
| dateConfig.dateRegexes.dateRegex | string | `"(date|dt|year|decade)"` |  |
| dateConfig.dateRegexes.endDateRegex | string | `"(end).*(date|dt|year|decade)"` |  |
| dateConfig.dateRegexes.startDateRegex | string | `"(start|st).*(date|dt|year|decade)"` |  |
| defaultContactEmail | string | `"mail@example.com"` |  |
| defaultDatasetBucket | string | `nil` | Default bucket used to store datasets data files. If no value is provided `global.defaultDatasetBucket` will be used. |
| defaultImage.pullPolicy | string | `"IfNotPresent"` |  |
| defaultImage.pullSecrets | bool | `false` |  |
| defaultImage.repository | string | `"docker.io/data61"` |  |
| defaultTimeZone | string | `nil` | Default Timezone that used to display tiem related string. If not set, default value will be "Australia/Sydney" |
| disableAuthenticationFeatures | bool | `false` |  |
| discourseIntegrationDatasetPage | bool | `true` | Whether the discourse post integration should be turned on on dataset page. |
| discourseIntegrationDistributionPage | bool | `true` | Whether the discourse post integration should be turned on on distribution page. |
| discourseSiteUrl | string | `nil` | The discourse site url.  Set this value to turn on the discourse post integration on dataset & distribution pages. |
| enableCrawlerViews | bool | `true` | Whether enable crawler html view for crawlers that has limited rendering capability.  When discourse intergration feature is turned on (i.e. `discourseSiteUrl` is set and either `discourseIntegrationDatasetPage` or `discourseIntegrationDistributionPage` is true),  this will be overwritten to true. |
| externalCssFiles | list | `[]` | a list of external css file urls to be loaded. Can be used to further customise UI styling. this config value should be type of `string[]`. |
| externalUIComponents | list | `[]` | a list of external UI component JS bundle file urls.  Can be used to replace existing built-in React UI component for customisation. this config value should be type of `string[]` |
| extraConfigData | object | `{}` | Extra config data for external plugins. Normally served as a way to config external UI plugin components at runtime. |
| featureFlags.cataloguing | bool | `true` | turn on / off metadata creation tool.  If this option is `false`, user won't be able to access the dataset add / edit UI  |
| featureFlags.datasetApprovalWorkflowOn | bool | `false` | turn on / off dataset approval note step |
| featureFlags.datasetLikeButton | bool | `false` | turn on / off like / Dislike button.  At this moment, `like / Dislike button` component is a place holder only for allowing plugin external UI plugin component. |
| featureFlags.enableAutoMetadataFetchButton | bool | `true` | turn on / off the auto metadata fetch button. Users are still able to add an "API / dataset URL" via "Manually enter metadata" button |
| featureFlags.previewAddDataset | bool | `false` | turn on / off the preview mode of metadata creation tool. Under preview mode, user can play with the metadata creation tool without requiring admin permission. No data will be saved under this mode. |
| featureFlags.publishToDga | bool | `false` | turn on / off the UI switch that allow user to select whether to auto push dataset data to a CKAN instance. this is an experimental feature and requires the deployment of [magda-minion-ckan-exporter](https://github.com/magda-io/magda-minion-ckan-exporter) |
| featureFlags.useStorageApi | bool | `true` | turn on / off the UI option to use Magda internal storage for file storage. |
| gapiIds | list | `[]` | Google Analytics Ids |
| homePageUrl | string | `nil` | an alternative home page url.  By default, all home page related links will take users to Magda home page. You can set a different URL here to take users to a different landing page. |
| image.name | string | `"magda-web-server"` |  |
| keywordsBlackList[0] | string | `"Mr"` |  |
| keywordsBlackList[10] | string | `"Mr."` |  |
| keywordsBlackList[11] | string | `"Ms."` |  |
| keywordsBlackList[12] | string | `"Mrs."` |  |
| keywordsBlackList[13] | string | `"Miss."` |  |
| keywordsBlackList[14] | string | `"Dr."` |  |
| keywordsBlackList[15] | string | `"Hon."` |  |
| keywordsBlackList[16] | string | `"Jr."` |  |
| keywordsBlackList[17] | string | `"Prof."` |  |
| keywordsBlackList[18] | string | `"Sr."` |  |
| keywordsBlackList[19] | string | `"St."` |  |
| keywordsBlackList[1] | string | `"Ms"` |  |
| keywordsBlackList[2] | string | `"Mrs"` |  |
| keywordsBlackList[3] | string | `"Miss"` |  |
| keywordsBlackList[4] | string | `"Dr"` |  |
| keywordsBlackList[5] | string | `"Hon"` |  |
| keywordsBlackList[6] | string | `"Jr"` |  |
| keywordsBlackList[7] | string | `"Prof"` |  |
| keywordsBlackList[8] | string | `"Sr"` |  |
| keywordsBlackList[9] | string | `"St"` |  |
| listenPort | int | `80` |  |
| mandatoryFields[0] | string | `"dataset.title"` |  |
| mandatoryFields[10] | string | `"informationSecurity.disseminationLimits"` |  |
| mandatoryFields[11] | string | `"publishToDga"` |  |
| mandatoryFields[1] | string | `"dataset.description"` |  |
| mandatoryFields[2] | string | `"dataset.defaultLicense"` |  |
| mandatoryFields[3] | string | `"distributions.title"` |  |
| mandatoryFields[4] | string | `"distributions.format"` |  |
| mandatoryFields[5] | string | `"distributions.license"` |  |
| mandatoryFields[6] | string | `"dataset.publisher"` |  |
| mandatoryFields[7] | string | `"licenseLevel"` |  |
| mandatoryFields[8] | string | `"dataset.defaultLicense"` |  |
| mandatoryFields[9] | string | `"informationSecurity.classification"` |  |
| noManualKeywords | bool | `false` |  |
| noManualThemes | bool | `false` |  |
| openInExternalTerriaMapButtonText | string | `nil` | When set, the string here will replace the text of the `Open in National Map` button in Map Preview area. |
| openInExternalTerriaMapTargetUrl | string | `nil` | When set, the `Open in National Map` button in Map Preview area will sent map data to the URL provided and open the map preview there. When not set, UI will by default send to the National Map. |
| previewMapFormatPerference | list | `[{"format":"WMS","urlRegex":"^(?!.*(SceneServer)).*$"},{"format":"ESRI MAPSERVER","urlRegex":"MapServer"},{"format":"WFS","urlRegex":"^(?!.*(SceneServer)).*$"},{"format":"ESRI FEATURESERVER","urlRegex":"FeatureServer"},{"format":"GeoJSON","singleFile":true},{"format":"csv-geo-au","singleFile":true},{"format":"KML","singleFile":true},{"format":"KMZ","singleFile":true}]` | Preview map module format perference list The list includes one or more `format perference item`. When there are more than one data source available, "Preview Map module" will use this perference to determine which data soruce will be used. It will go through the perference list. The first matched format (i.e. find a data source with the format ) will be chosen. A `format perference item` can have the following fields: <ul>  <li>format: the format of the preferred data source. compulsory. case insensitive. </li>  <li>       isDataFile: Optional. Default to `false`. Indicate whether the specified format is a static data file or API.        If it's a static file, "Preview Map Module" will attempt to check the target file size and ask user to confirm whether he wants to render the file for large files.       The file size threshold is specified by config option `automaticPreviewMaxFileSize`.  </li>  <li>       urlRegex: optional; when exists, it will be used as regex string to double check the data source access url to confirm whether it's indeed the format specified.       If not provided or empty, only `format` will be used to determine whether a data source matches the `format perference item`.  <li> </ul> |
| registryApiBaseUrlInternal | string | `"http://registry-api/v0"` |  |
| replicas | string | `nil` | no. of replicas required for the deployment. If not set, k8s will assume `1` but allows HPA (autoscaler) alters it. @default 1 |
| resources.limits.cpu | string | `"100m"` |  |
| resources.requests.cpu | string | `"10m"` |  |
| resources.requests.memory | string | `"30Mi"` |  |
| service.type | string | `nil` | how to expose serice. Only used when `.Values.global.exposeNodePorts` is not true. @default ClusterIP |
| showContactButtonForNoContactPointDataset | bool | `false` | Whether show the "Ask a question about this dataset" button for datasets without contact point info. By default, the "Ask a question about this dataset" button is only shown for datasets has contact point info. For datasets without contact point info, the inquiry will be sent to the default recipient provided by `global.defaultContactEmail`. |
| showNotificationBanner | bool | `false` |  |
| supportExternalTerriaMapV7 | bool | `false` | When set to true, the `Open in National Map` button in Map Preview area will send data in v7 format. |
| uiBaseUrl | string | `nil` | Serve Magda UI at a non-root url path. e.g. `http://example.com/magda/`. Its value should have a leading slash, but no trailing slash. When not set, by default, the magda UI will be served at `/`. (e.g. `http://example.com/`)  When `global.externalUrl` is set to an URL with non-root path (e.g. http://example.com/magda-dir/),  unless `uiBaseUrl` has a non-empty value that is not `/`, the effective runtime value of `uiBaseUrl` will be overwritten to `/magda-dir`. You probably only want to manually set `uiBaseUrl` when you want to move magda UI to a non-root URL path but still leave all APIs at root path. |
| useLocalStyleSheet | bool | `false` |  |
| useMagdaStorageByDefault | bool | `true` | Whether use Magda to store dataset data files by default When use Magda's metadata creation tool to create a dataset, user can choose to upload data files to Magda's storage (via storage API). Or managing the metadata only. When `featureFlags.useStorageApi` is set to `false`, this option has no effect. |
| vocabularyApiEndpoints | list | `[]` |  |

----------------------------------------------
Autogenerated from chart metadata using [helm-docs v1.5.0](https://github.com/norwoodj/helm-docs/releases/v1.5.0)
