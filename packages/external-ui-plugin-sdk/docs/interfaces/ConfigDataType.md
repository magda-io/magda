[@magda/external-ui-plugin-sdk](../README.md) / [Exports](../modules.md) / ConfigDataType

# Interface: ConfigDataType

Magda frontend application configuration data structure.
This config data is only configurable at time of the deployment via [Magda web-server Helm Chart](https://github.com/magda-io/magda/tree/master/deploy/helm/internal-charts/web-server).
At the beginning of starting up, the frontend application will retrieve this config data from the web server.
For default values, please refer to [Magda web-server Helm Chart Doc](https://github.com/magda-io/magda/tree/master/deploy/helm/internal-charts/web-server).

**`Export`**

**`Interface`**

ConfigDataType

## Table of contents

### Properties

- [adminApiBaseUrl](ConfigDataType.md#adminapibaseurl)
- [anonymousUserLandingPage](ConfigDataType.md#anonymoususerlandingpage)
- [authApiBaseUrl](ConfigDataType.md#authapibaseurl)
- [authPluginRedirectUrl](ConfigDataType.md#authpluginredirecturl)
- [authStatusRefreshInterval](ConfigDataType.md#authstatusrefreshinterval)
- [authenticatedUserLandingPage](ConfigDataType.md#authenticateduserlandingpage)
- [automaticPreviewMaxFileSize](ConfigDataType.md#automaticpreviewmaxfilesize)
- [baseExternalUrl](ConfigDataType.md#baseexternalurl)
- [baseUrl](ConfigDataType.md#baseurl)
- [boundingBox](ConfigDataType.md#boundingbox)
- [breakpoints](ConfigDataType.md#breakpoints)
- [ckanExportServers](ConfigDataType.md#ckanexportservers)
- [commonFetchRequestOptions](ConfigDataType.md#commonfetchrequestoptions)
- [contentApiBaseUrl](ConfigDataType.md#contentapibaseurl)
- [contentUrl](ConfigDataType.md#contenturl)
- [correspondenceApiBaseUrl](ConfigDataType.md#correspondenceapibaseurl)
- [custodianOrgLevel](ConfigDataType.md#custodianorglevel)
- [datasetThemes](ConfigDataType.md#datasetthemes)
- [dateConfig](ConfigDataType.md#dateconfig)
- [defaultCkanServer](ConfigDataType.md#defaultckanserver)
- [defaultContactEmail](ConfigDataType.md#defaultcontactemail)
- [defaultDatasetBucket](ConfigDataType.md#defaultdatasetbucket)
- [defaultOrganizationId](ConfigDataType.md#defaultorganizationid)
- [defaultTimeZone](ConfigDataType.md#defaulttimezone)
- [disableAuthenticationFeatures](ConfigDataType.md#disableauthenticationfeatures)
- [discourseIntegrationDatasetPage](ConfigDataType.md#discourseintegrationdatasetpage)
- [discourseIntegrationDistributionPage](ConfigDataType.md#discourseintegrationdistributionpage)
- [discourseSiteUrl](ConfigDataType.md#discoursesiteurl)
- [enableCrawlerViews](ConfigDataType.md#enablecrawlerviews)
- [externalCssFiles](ConfigDataType.md#externalcssfiles)
- [externalUIComponents](ConfigDataType.md#externaluicomponents)
- [extraConfigData](ConfigDataType.md#extraconfigdata)
- [facets](ConfigDataType.md#facets)
- [fallbackUrl](ConfigDataType.md#fallbackurl)
- [featureFlags](ConfigDataType.md#featureflags)
- [gapiIds](ConfigDataType.md#gapiids)
- [headerLogoUrl](ConfigDataType.md#headerlogourl)
- [headerMobileLogoUrl](ConfigDataType.md#headermobilelogourl)
- [homePageUrl](ConfigDataType.md#homepageurl)
- [image](ConfigDataType.md#image)
- [indexerApiBaseUrl](ConfigDataType.md#indexerapibaseurl)
- [keywordsBlackList](ConfigDataType.md#keywordsblacklist)
- [mandatoryFields](ConfigDataType.md#mandatoryfields)
- [months](ConfigDataType.md#months)
- [noManualKeywords](ConfigDataType.md#nomanualkeywords)
- [noManualThemes](ConfigDataType.md#nomanualthemes)
- [openInExternalTerriaMapButtonText](ConfigDataType.md#openinexternalterriamapbuttontext)
- [openInExternalTerriaMapTargetUrl](ConfigDataType.md#openinexternalterriamaptargeturl)
- [openfaasBaseUrl](ConfigDataType.md#openfaasbaseurl)
- [previewMapBaseUrl](ConfigDataType.md#previewmapbaseurl)
- [previewMapFormatPerference](ConfigDataType.md#previewmapformatperference)
- [proxyUrl](ConfigDataType.md#proxyurl)
- [registryApiBaseUrl](ConfigDataType.md#registryapibaseurl)
- [registryApiReadOnlyBaseUrl](ConfigDataType.md#registryapireadonlybaseurl)
- [rssUrl](ConfigDataType.md#rssurl)
- [searchApiBaseUrl](ConfigDataType.md#searchapibaseurl)
- [showContactButtonForNoContactPointDataset](ConfigDataType.md#showcontactbuttonfornocontactpointdataset)
- [showNotificationBanner](ConfigDataType.md#shownotificationbanner)
- [storageApiBaseUrl](ConfigDataType.md#storageapibaseurl)
- [supportExternalTerriaMapV7](ConfigDataType.md#supportexternalterriamapv7)
- [uiBaseUrl](ConfigDataType.md#uibaseurl)
- [useMagdaStorageByDefault](ConfigDataType.md#usemagdastoragebydefault)
- [vocabularyApiEndpoints](ConfigDataType.md#vocabularyapiendpoints)

## Properties

### adminApiBaseUrl

• **adminApiBaseUrl**: `string`

The admin API base URL config value that is supplied by the web server.
When this value is not available from the server (e.g. when run web client locally), the default "fallback" API server url will be used to generate this value.

**`Memberof`**

ConfigDataType

#### Defined in

index.d.ts:346

___

### anonymousUserLandingPage

• **anonymousUserLandingPage**: `string`

The landing page URL for anonymous users.
By default, it's "/home". You might want to set to "/account", if your system is not open to public users.

**`Memberof`**

ConfigDataType

#### Defined in

index.d.ts:729

___

### authApiBaseUrl

• **authApiBaseUrl**: `string`

The authorisation API base URL config value that is supplied by the web server.
When this value is not available from the server (e.g. when run web client locally), the default "fallback" API server url will be used to generate this value.

**`Memberof`**

ConfigDataType

#### Defined in

index.d.ts:195

___

### authPluginRedirectUrl

• **authPluginRedirectUrl**: `string`

The default redirection url for all auth plugins once the authentication process is completed.

**`Memberof`**

ConfigDataType

#### Defined in

index.d.ts:212

___

### authStatusRefreshInterval

• `Optional` **authStatusRefreshInterval**: `number`

How long before reload the current user's auth data in the background.
Useful to transit UI to correct status when user leave browser open without interaction for long time.
Default: 5 mins

**`Memberof`**

ConfigDataType

#### Defined in

index.d.ts:748

___

### authenticatedUserLandingPage

• **authenticatedUserLandingPage**: `string`

The landing page URL for authenticated users.
By default, it's "/home".

**`Memberof`**

ConfigDataType

#### Defined in

index.d.ts:738

___

### automaticPreviewMaxFileSize

• **automaticPreviewMaxFileSize**: `number`

The maximum size that a file can be in order to be automatically previewed by the ui as a map, graph or table.

**`Memberof`**

ConfigDataType

#### Defined in

index.d.ts:450

___

### baseExternalUrl

• **baseExternalUrl**: `string`

Similar to `baseUrl`. But this field always includes the external access domain of the application.
You might want to use its value in use cases e.g. generating external accessible links for email content.

**`Memberof`**

ConfigDataType

#### Defined in

index.d.ts:221

___

### baseUrl

• **baseUrl**: `string`

The base URL path of all APIs (e.g. '/');
The value of the field might be either from config data retrieved from the server or (when run web client locally) the hardcoded URL to a default "fallback" dev API server url for testing.

**`Memberof`**

ConfigDataType

#### Defined in

index.d.ts:204

___

### boundingBox

• **boundingBox**: `Object`

Default boundingBox for map preview module

**`Memberof`**

ConfigDataType

#### Type declaration

| Name | Type |
| :------ | :------ |
| `east` | `number` |
| `north` | `number` |
| `south` | `number` |
| `west` | `number` |

#### Defined in

index.d.ts:651

___

### breakpoints

• `Optional` **breakpoints**: `Object`

The responsive UI break points.

**`Memberof`**

ConfigDataType

#### Type declaration

| Name | Type |
| :------ | :------ |
| `large` | `number` |
| `medium` | `number` |
| `small` | `number` |

#### Defined in

index.d.ts:603

___

### ckanExportServers

• **ckanExportServers**: `Object`

Config for optional dataset auto-sync to ckan feature.
Only available when [magda-minion-ckan-exporter](https://github.com/magda-io/magda-minion-ckan-exporter) is deployed and feature flag `publishToDga` is `true`.
This feature is still in beta.

**`Memberof`**

ConfigDataType

#### Index signature

▪ [ckanServerUrl: `string`]: `boolean`

#### Defined in

index.d.ts:511

___

### commonFetchRequestOptions

• **commonFetchRequestOptions**: `RequestInit`

This field allow you to config the common settings of all [fetch requests](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch) sent by the frontend application.
One common use case is to set [credentials field](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#credentials).
Its default value is `"credentials": "same-origin"`. When running the web client locally for debugging purpose, you might want to set it to `"credentials": "include"`.
This will allow `credentials` (e.g. cookie) to be shared with remote dev testing API server.

**`Memberof`**

ConfigDataType

#### Defined in

index.d.ts:170

___

### contentApiBaseUrl

• **contentApiBaseUrl**: `string`

The content API base URL config value that is supplied by the web server.
When this value is not available from the server (e.g. when run web client locally), the default "fallback" API server url will be used to generate this value.

**`Memberof`**

ConfigDataType

#### Defined in

index.d.ts:250

___

### contentUrl

• **contentUrl**: `string`

The API endpoint URL to retrieve all default content items (e.g. header & footer items etc.).
The value of this field is created from field `contentApiBaseUrl`.
It includes all required query parameters in the URL and serves as a pre-configured short cut to retrieve all default content items for a user.

**`Memberof`**

ConfigDataType

#### Defined in

index.d.ts:260

___

### correspondenceApiBaseUrl

• `Optional` **correspondenceApiBaseUrl**: `string`

The correspondence API base URL config value that is supplied by the web server.
When this value is not available from the server (e.g. when run web client locally), the default "fallback" API server url will be used to generate this value.

**`Memberof`**

ConfigDataType

#### Defined in

index.d.ts:328

___

### custodianOrgLevel

• **custodianOrgLevel**: `number`

deprecated. Not used anymore. To be removed in future.

**`Memberof`**

ConfigDataType

#### Defined in

index.d.ts:442

___

### datasetThemes

• `Optional` **datasetThemes**: `string`[]

Predefined dataset theme list used in the dataset editor.

**`Memberof`**

ConfigDataType

#### Defined in

index.d.ts:490

___

### dateConfig

• **dateConfig**: `DateConfig`

The date format config used in dataset editor auto date information extraction.

**`Memberof`**

ConfigDataType

#### Defined in

index.d.ts:466

___

### defaultCkanServer

• **defaultCkanServer**: `string`

The default CKAN server for the optional dataset auto-sync to ckan feature.
see config field `ckanExportServers`.

**`Memberof`**

ConfigDataType

#### Defined in

index.d.ts:522

___

### defaultContactEmail

• `Optional` **defaultContactEmail**: `string`

Default email to forward users' inquiry.

**`Memberof`**

ConfigDataType

#### Defined in

index.d.ts:434

___

### defaultDatasetBucket

• `Optional` **defaultDatasetBucket**: `string`

The default storage bucket that storage API should use.

**`Memberof`**

ConfigDataType

#### Defined in

index.d.ts:720

___

### defaultOrganizationId

• `Optional` **defaultOrganizationId**: `string`

Default Organization ID for dataset editor UI.

**`Memberof`**

ConfigDataType

#### Defined in

index.d.ts:426

___

### defaultTimeZone

• `Optional` **defaultTimeZone**: `string`

The default timezone used in the application.

**`Memberof`**

ConfigDataType

#### Defined in

index.d.ts:530

___

### disableAuthenticationFeatures

• **disableAuthenticationFeatures**: `boolean`

When set to `true`, the user account related links & buttons will be removed.
Default to `false`.

**`Memberof`**

ConfigDataType

#### Defined in

index.d.ts:372

___

### discourseIntegrationDatasetPage

• `Optional` **discourseIntegrationDatasetPage**: `boolean`

For the optional discourse site integration feature.
Indicate whether show the discourse comment area on dataset page.

**`Memberof`**

ConfigDataType

#### Defined in

index.d.ts:557

___

### discourseIntegrationDistributionPage

• `Optional` **discourseIntegrationDistributionPage**: `boolean`

For the optional discourse site integration feature.
Indicate whether show the discourse comment area on distribution page.

**`Memberof`**

ConfigDataType

#### Defined in

index.d.ts:566

___

### discourseSiteUrl

• `Optional` **discourseSiteUrl**: `string`

The discourse site url.
For the optional discourse site integration feature.
When its value is empty, the feature will be disabled.

**`Memberof`**

ConfigDataType

#### Defined in

index.d.ts:548

___

### enableCrawlerViews

• `Optional` **enableCrawlerViews**: `boolean`

Indicate whether or not the crawler web view is enabled on [Magda web-server](https://github.com/magda-io/magda/tree/master/deploy/helm/internal-charts/web-server) to provide search engine optimized views.

**`Memberof`**

ConfigDataType

#### Defined in

index.d.ts:538

___

### externalCssFiles

• `Optional` **externalCssFiles**: `string`[]

A list of optional external CSS files to overwrite the looking of the site.

**`Memberof`**

ConfigDataType

#### Defined in

index.d.ts:582

___

### externalUIComponents

• `Optional` **externalUIComponents**: `string`[]

A list of optional external UI component plugins bundle URLs.

**`Memberof`**

ConfigDataType

#### Defined in

index.d.ts:574

___

### extraConfigData

• `Optional` **extraConfigData**: `Object`

extraConfigData is mainly for config data passing to external UI plugins

**`Memberof`**

ConfigDataType

#### Index signature

▪ [key: `string`]: `any`

#### Defined in

index.d.ts:692

___

### facets

• `Optional` **facets**: `FacetConfigItem`[]

Search panel facet config.

**`Memberof`**

ConfigDataType

#### Defined in

index.d.ts:615

___

### fallbackUrl

• `Optional` **fallbackUrl**: `string`

The url of fallback dev API server for testing.
It will only be used when the web client is run locally.

**`Memberof`**

ConfigDataType

#### Defined in

index.d.ts:381

___

### featureFlags

• **featureFlags**: `Partial`<`Record`<`FeatureFlagType`, `boolean`\>\>

A set of feature flags to turn on/of a list of features.

**`Memberof`**

ConfigDataType

#### Defined in

index.d.ts:391

___

### gapiIds

• `Optional` **gapiIds**: `string`[]

Google Analytics ID

**`Memberof`**

ConfigDataType

#### Defined in

index.d.ts:354

___

### headerLogoUrl

• `Optional` **headerLogoUrl**: `string`

Header logo URL.

**`Memberof`**

ConfigDataType

#### Defined in

index.d.ts:623

___

### headerMobileLogoUrl

• `Optional` **headerMobileLogoUrl**: `string`

Header logo URL for mobile view.

**`Memberof`**

ConfigDataType

#### Defined in

index.d.ts:631

___

### homePageUrl

• `Optional` **homePageUrl**: `string`

The url used when user click `home` link or header logo.
Default to "/"

**`Memberof`**

ConfigDataType

#### Defined in

index.d.ts:591

___

### image

• `Optional` **image**: `Object`

The docker image information of the web server that serves all frontend resources of the application.

**`Memberof`**

ConfigDataType

#### Type declaration

| Name | Type |
| :------ | :------ |
| `pullPolicy?` | `string` |
| `repository?` | `string` |
| `tag?` | `string` |

#### Defined in

index.d.ts:182

___

### indexerApiBaseUrl

• **indexerApiBaseUrl**: `string`

The indexer API base URL config value that is supplied by the web server.
When this value is not available from the server (e.g. when run web client locally), the default "fallback" API server url will be used to generate this value.

**`Memberof`**

ConfigDataType

#### Defined in

index.d.ts:287

___

### keywordsBlackList

• `Optional` **keywordsBlackList**: `string`[]

A list of keywords that should never be generated by the auto keyword generation module in the dataset editor UI.

**`Memberof`**

ConfigDataType

#### Defined in

index.d.ts:418

___

### mandatoryFields

• **mandatoryFields**: `ValidationFieldList`

List all mandatory fields in dataset editor.

**`Memberof`**

ConfigDataType

#### Defined in

index.d.ts:458

___

### months

• `Optional` **months**: `string`[]

A list of month name to be used in the application

**`Memberof`**

ConfigDataType

#### Defined in

index.d.ts:639

___

### noManualKeywords

• `Optional` **noManualKeywords**: `boolean`

Whether or not allow user to input manual keywords in the dataset editor.

**`Memberof`**

ConfigDataType

#### Defined in

index.d.ts:474

___

### noManualThemes

• `Optional` **noManualThemes**: `boolean`

Whether or not allow user to input manual themes in the dataset editor.

**`Memberof`**

ConfigDataType

#### Defined in

index.d.ts:482

___

### openInExternalTerriaMapButtonText

• `Optional` **openInExternalTerriaMapButtonText**: `string`

The the "Open in XXXX" over the map preview module button text label.
By default, it's set to "Open in National Map".
But you can set to other value in case you want to send data to your own terria map.

**`Memberof`**

ConfigDataType

#### Defined in

index.d.ts:674

___

### openInExternalTerriaMapTargetUrl

• `Optional` **openInExternalTerriaMapTargetUrl**: `string`

The target terria map URL that the "Open in XXXX" over the map preview module button should send data to.

**`Memberof`**

ConfigDataType

#### Defined in

index.d.ts:682

___

### openfaasBaseUrl

• `Optional` **openfaasBaseUrl**: `string`

The openfaas API base URL config value that is supplied by the web server.
When this value is not available from the server (e.g. when run web client locally), the default "fallback" API server url will be used to generate this value.

**`Memberof`**

ConfigDataType

#### Defined in

index.d.ts:499

___

### previewMapBaseUrl

• **previewMapBaseUrl**: `string`

The map preview module base access URL config value that is supplied by the web server.
When this value is not available from the server (e.g. when run web client locally), the default "fallback" API server url will be used to generate this value.

**`Memberof`**

ConfigDataType

#### Defined in

index.d.ts:269

___

### previewMapFormatPerference

• `Optional` **previewMapFormatPerference**: `RawPreviewMapFormatPerferenceItem`[]

A format preference list for the map preview module.
It controls, on dataset page, when more than one formats are available, which format data file / API will be used for best user experience.

**`Memberof`**

ConfigDataType

#### Defined in

index.d.ts:703

___

### proxyUrl

• **proxyUrl**: `string`

The CORS resource proxy url. Mainly used by map preview module to load CORS resources from whitelist domains.
Its value is generated from `previewMapBaseUrl`.

**`Memberof`**

ConfigDataType

#### Defined in

index.d.ts:278

___

### registryApiBaseUrl

• **registryApiBaseUrl**: `string`

The registry API base URL config value that is supplied by the web server.
When this value is not available from the server (e.g. when run web client locally), the default "fallback" API server url will be used to generate this value.
Please note: this registry API endpoint can handle both read & write requests.
Since v0.0.59, readonly (HTTP GET) requests that are sent to this endpoint externally will be auto-forward to the readonly endpoint `registryApiReadOnlyBaseUrl`.
However, for performance consideration (as gateway doesn't need to check HTTP method), `registryApiReadOnlyBaseUrl` should still be the preferred endpoint for readonly requests.

**`Memberof`**

ConfigDataType

#### Defined in

index.d.ts:299

___

### registryApiReadOnlyBaseUrl

• **registryApiReadOnlyBaseUrl**: `string`

The registry readonly API base URL config value that is supplied by the web server.
When this value is not available from the server (e.g. when run web client locally), the default "fallback" API server url will be used to generate this value.
Please note: this registry API endpoint can only handle both read requests only.
The readonly registry API endpoint can scale horizontally easily. Thus, should be the preferred endpoint for serving readonly requests.

**`Memberof`**

ConfigDataType

#### Defined in

index.d.ts:310

___

### rssUrl

• `Optional` **rssUrl**: `string`

remote RSS news endpoint.
This config field is deprecated & to be removed in future.

**`Memberof`**

ConfigDataType

#### Defined in

index.d.ts:363

___

### searchApiBaseUrl

• **searchApiBaseUrl**: `string`

The search API base URL config value that is supplied by the web server.
When this value is not available from the server (e.g. when run web client locally), the default "fallback" API server url will be used to generate this value.

**`Memberof`**

ConfigDataType

#### Defined in

index.d.ts:319

___

### showContactButtonForNoContactPointDataset

• `Optional` **showContactButtonForNoContactPointDataset**: `boolean`

Whether or not show the contact button when the contact information of the dataset is not available.
When set to `true`, the inquiries will be sent to the default contact email.

**`Memberof`**

ConfigDataType

#### Defined in

index.d.ts:712

___

### showNotificationBanner

• `Optional` **showNotificationBanner**: `boolean`

Whether or not the notification banner should be shown.

**`Memberof`**

ConfigDataType

#### Defined in

index.d.ts:241

___

### storageApiBaseUrl

• **storageApiBaseUrl**: `string`

The storage API base URL config value that is supplied by the web server.
When this value is not available from the server (e.g. when run web client locally), the default "fallback" API server url will be used to generate this value.

**`Memberof`**

ConfigDataType

#### Defined in

index.d.ts:337

___

### supportExternalTerriaMapV7

• `Optional` **supportExternalTerriaMapV7**: `boolean`

Whether the "Open in XXXX" button over the map preview module should support terria map v7 config format.

**`Memberof`**

ConfigDataType

#### Defined in

index.d.ts:664

___

### uiBaseUrl

• **uiBaseUrl**: `string`

The base url path where the web client will be served at.
E.g.  when `uiBaseUrl`=`/`, the web client will served at `https://example.com/`.
When `uiBaseUrl`=`/abc/def`, the web client will served at `https://example.com/abc/def`.
Please note: this field only reflect where the wbe client / frontend application is served at.
It doesn't reflect where all APIs are served. To find out it, the value `baseUrl` field should be used.

**`Memberof`**

ConfigDataType

#### Defined in

index.d.ts:233

___

### useMagdaStorageByDefault

• **useMagdaStorageByDefault**: `boolean`

Whether or not the "use Magda storage" option should be pre-selected on dataset editor UI.

**`Memberof`**

ConfigDataType

#### Defined in

index.d.ts:399

___

### vocabularyApiEndpoints

• **vocabularyApiEndpoints**: `string`[]

A list of vocabulary api endpoints that are used to validate the auto-generated keywords in dataset editor UI.
By default, it's set to:
- "https://vocabs.ands.org.au/repository/api/lda/abares/australian-land-use-and-management-classification/version-8/concept.json",
- "https://vocabs.ands.org.au/repository/api/lda/ands-nc/controlled-vocabulary-for-resource-type-genres/version-1-1/concept.json"

**`Memberof`**

ConfigDataType

#### Defined in

index.d.ts:410
