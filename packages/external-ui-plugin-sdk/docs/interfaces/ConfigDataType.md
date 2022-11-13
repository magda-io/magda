[@magda/external-ui-plugin-sdk](../README.md) / [Exports](../modules.md) / ConfigDataType

# Interface: ConfigDataType

Magda frontend application configuration data structure.
This config data is only configurable at time of the deployment via [Magda web-server Helm Chart](https://github.com/magda-io/magda/tree/master/deploy/helm/internal-charts/web-server).
At the beginning of starting up, the frontend application will retrieve this config data from the web server.

**`Export`**

**`Interface`**

ConfigDataType

## Table of contents

### Properties

- [adminApiBaseUrl](ConfigDataType.md#adminapibaseurl)
- [adminApiUrl](ConfigDataType.md#adminapiurl)
- [anonymousUserLandingPage](ConfigDataType.md#anonymoususerlandingpage)
- [authApiBaseUrl](ConfigDataType.md#authapibaseurl)
- [authApiUrl](ConfigDataType.md#authapiurl)
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
- [contentApiURL](ConfigDataType.md#contentapiurl)
- [contentUrl](ConfigDataType.md#contenturl)
- [correspondenceApiBaseUrl](ConfigDataType.md#correspondenceapibaseurl)
- [correspondenceApiUrl](ConfigDataType.md#correspondenceapiurl)
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
- [previewMapUrl](ConfigDataType.md#previewmapurl)
- [proxyUrl](ConfigDataType.md#proxyurl)
- [registryApiBaseUrl](ConfigDataType.md#registryapibaseurl)
- [registryApiReadOnlyBaseUrl](ConfigDataType.md#registryapireadonlybaseurl)
- [registryFullApiUrl](ConfigDataType.md#registryfullapiurl)
- [registryReadOnlyApiUrl](ConfigDataType.md#registryreadonlyapiurl)
- [rssUrl](ConfigDataType.md#rssurl)
- [searchApiBaseUrl](ConfigDataType.md#searchapibaseurl)
- [searchApiUrl](ConfigDataType.md#searchapiurl)
- [showContactButtonForNoContactPointDataset](ConfigDataType.md#showcontactbuttonfornocontactpointdataset)
- [showNotificationBanner](ConfigDataType.md#shownotificationbanner)
- [storageApiBaseUrl](ConfigDataType.md#storageapibaseurl)
- [storageApiUrl](ConfigDataType.md#storageapiurl)
- [supportExternalTerriaMapV7](ConfigDataType.md#supportexternalterriamapv7)
- [uiBaseUrl](ConfigDataType.md#uibaseurl)
- [useMagdaStorageByDefault](ConfigDataType.md#usemagdastoragebydefault)
- [vocabularyApiEndpoints](ConfigDataType.md#vocabularyapiendpoints)

## Properties

### adminApiBaseUrl

• `Optional` **adminApiBaseUrl**: `string`

#### Defined in

index.d.ts:285

---

### adminApiUrl

• **adminApiUrl**: `string`

#### Defined in

index.d.ts:286

---

### anonymousUserLandingPage

• **anonymousUserLandingPage**: `string`

#### Defined in

index.d.ts:399

---

### authApiBaseUrl

• `Optional` **authApiBaseUrl**: `string`

The authorisation API base URL supplied by server side.
The value of this field will be used to populate field `authApiUrl`.
When this value is not available (e.g. run web client locally), `authApiUrl` will be set to the authorisation API url of a default ("fallback") dev API server.

**`Memberof`**

ConfigDataType

#### Defined in

index.d.ts:177

---

### authApiUrl

• **authApiUrl**: `string`

The authorisation API base URL endpoint.
Its value is either populated from config data retrieved from the server (i.e. `authApiBaseUrl` field).
Or a default value that points to "fallback" dev API server.
Frontend app use this value of this field to construct the full URLs to access all different content APIs.

**`Memberof`**

ConfigDataType

#### Defined in

index.d.ts:188

---

### authPluginRedirectUrl

• **authPluginRedirectUrl**: `string`

The default redirection url for all auth plugins once the authentication process is completed.

**`Memberof`**

ConfigDataType

#### Defined in

index.d.ts:205

---

### authStatusRefreshInterval

• `Optional` **authStatusRefreshInterval**: `number`

How long before reload the current user's auth data in the background.
Useful to transit UI to correct status when user leave browser open without interaction for long time.
Default: 5 mins

**`Memberof`**

ConfigDataType

#### Defined in

index.d.ts:409

---

### authenticatedUserLandingPage

• **authenticatedUserLandingPage**: `string`

#### Defined in

index.d.ts:400

---

### automaticPreviewMaxFileSize

• **automaticPreviewMaxFileSize**: `number`

The maximum size that a file can be in order to be automatically previewed by the ui as a map, graph or table.

**`Memberof`**

ConfigDataType

#### Defined in

index.d.ts:329

---

### baseExternalUrl

• **baseExternalUrl**: `string`

Similar to `baseUrl`. But this field includes the external access domain of the application.
You might want to use its value in use cases e.g. generating external accessible links.

**`Memberof`**

ConfigDataType

#### Defined in

index.d.ts:214

---

### baseUrl

• **baseUrl**: `string`

The base URL path of all APIs (e.g. '/');
The value of the field might either from config data retrieved from the server or the URL to a default "fallback" dev API server url for testing.

**`Memberof`**

ConfigDataType

#### Defined in

index.d.ts:197

---

### boundingBox

• **boundingBox**: `Object`

Default boundingBox for map preview module

**`Memberof`**

ConfigDataType

#### Type declaration

| Name    | Type     |
| :------ | :------- |
| `east`  | `number` |
| `north` | `number` |
| `south` | `number` |
| `west`  | `number` |

#### Defined in

index.d.ts:375

---

### breakpoints

• `Optional` **breakpoints**: `Object`

#### Type declaration

| Name     | Type     |
| :------- | :------- |
| `large`  | `number` |
| `medium` | `number` |
| `small`  | `number` |

#### Defined in

index.d.ts:349

---

### ckanExportServers

• **ckanExportServers**: `Object`

#### Index signature

▪ [ckanServerUrl: `string`]: `boolean`

#### Defined in

index.d.ts:337

---

### commonFetchRequestOptions

• **commonFetchRequestOptions**: `RequestInit`

This field allow you to config the common settings of all [fetch requests](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch) sent by the frontend application.
One common use case is to set [credentials field](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#credentials).
Its default value is `"credentials": "same-origin"`. When running the web client locally for debugging purpose, you might want to set it to `"credentials": "include"`.
This will allow `credentials` (e.g. cookie) to be shared with remote dev testing API server.

**`Memberof`**

ConfigDataType

#### Defined in

index.d.ts:151

---

### contentApiBaseUrl

• `Optional` **contentApiBaseUrl**: `string`

The content API base URL supplied by server side.
The value of this field will be used to populate field `contentApiURL`.
When this value is not available (e.g. run web client locally), `contentApiURL` will be set to the content API url of a default ("fallback") dev API server.

**`Memberof`**

ConfigDataType

#### Defined in

index.d.ts:244

---

### contentApiURL

• **contentApiURL**: `string`

The content API base URL endpoint.
Its value is either populated from config data retrieved from the server (i.e. `contentApiBaseUrl` field).
Or a default value that points to "fallback" dev API server.
Frontend app use this value of this field to construct the full URLs to access all different content APIs.

**`Memberof`**

ConfigDataType

#### Defined in

index.d.ts:255

---

### contentUrl

• **contentUrl**: `string`

The API URL to retrieve all default content items (e.g. header & footer items etc.).
The value of this field is created from field `contentApiURL`.

**`Memberof`**

ConfigDataType

#### Defined in

index.d.ts:264

---

### correspondenceApiBaseUrl

• `Optional` **correspondenceApiBaseUrl**: `string`

#### Defined in

index.d.ts:273

---

### correspondenceApiUrl

• **correspondenceApiUrl**: `string`

#### Defined in

index.d.ts:274

---

### custodianOrgLevel

• **custodianOrgLevel**: `number`

#### Defined in

index.d.ts:321

---

### datasetThemes

• `Optional` **datasetThemes**: `string`[]

#### Defined in

index.d.ts:334

---

### dateConfig

• **dateConfig**: `DateConfig`

#### Defined in

index.d.ts:331

---

### defaultCkanServer

• **defaultCkanServer**: `string`

#### Defined in

index.d.ts:340

---

### defaultContactEmail

• `Optional` **defaultContactEmail**: `string`

#### Defined in

index.d.ts:320

---

### defaultDatasetBucket

• `Optional` **defaultDatasetBucket**: `string`

#### Defined in

index.d.ts:398

---

### defaultOrganizationId

• `Optional` **defaultOrganizationId**: `string`

#### Defined in

index.d.ts:319

---

### defaultTimeZone

• `Optional` **defaultTimeZone**: `string`

#### Defined in

index.d.ts:341

---

### disableAuthenticationFeatures

• `Optional` **disableAuthenticationFeatures**: `boolean`

#### Defined in

index.d.ts:290

---

### discourseIntegrationDatasetPage

• `Optional` **discourseIntegrationDatasetPage**: `boolean`

#### Defined in

index.d.ts:344

---

### discourseIntegrationDistributionPage

• `Optional` **discourseIntegrationDistributionPage**: `boolean`

#### Defined in

index.d.ts:345

---

### discourseSiteUrl

• `Optional` **discourseSiteUrl**: `string`

#### Defined in

index.d.ts:343

---

### enableCrawlerViews

• `Optional` **enableCrawlerViews**: `boolean`

#### Defined in

index.d.ts:342

---

### externalCssFiles

• `Optional` **externalCssFiles**: `string`[]

#### Defined in

index.d.ts:347

---

### externalUIComponents

• `Optional` **externalUIComponents**: `string`[]

#### Defined in

index.d.ts:346

---

### extraConfigData

• `Optional` **extraConfigData**: `Object`

extraConfigData is mainly for config data passing to external UI plugins

**`Memberof`**

ConfigDataType

#### Index signature

▪ [key: `string`]: `any`

#### Defined in

index.d.ts:393

---

### facets

• `Optional` **facets**: `FacetConfigItem`[]

#### Defined in

index.d.ts:354

---

### fallbackUrl

• `Optional` **fallbackUrl**: `string`

The url of fallback dev API server for testing.
It will only be used when the web client is run locally.

**`Memberof`**

ConfigDataType

#### Defined in

index.d.ts:299

---

### featureFlags

• **featureFlags**: `Partial`<`Record`<`FeatureFlagType`, `boolean`\>\>

A set of feature flags to turn on/of a list of features.

**`Memberof`**

ConfigDataType

#### Defined in

index.d.ts:309

---

### gapiIds

• `Optional` **gapiIds**: `string`[]

Google Analytics ID

**`Memberof`**

ConfigDataType

#### Defined in

index.d.ts:284

---

### headerLogoUrl

• `Optional` **headerLogoUrl**: `string`

#### Defined in

index.d.ts:355

---

### headerMobileLogoUrl

• `Optional` **headerMobileLogoUrl**: `string`

#### Defined in

index.d.ts:356

---

### homePageUrl

• `Optional` **homePageUrl**: `string`

#### Defined in

index.d.ts:348

---

### image

• `Optional` **image**: `Object`

The docker image information of the web server that serves all frontend resources of the application.

**`Memberof`**

ConfigDataType

#### Type declaration

| Name          | Type     |
| :------------ | :------- |
| `pullPolicy?` | `string` |
| `repository?` | `string` |
| `tag?`        | `string` |

#### Defined in

index.d.ts:163

---

### indexerApiBaseUrl

• `Optional` **indexerApiBaseUrl**: `string`

#### Defined in

index.d.ts:266

---

### keywordsBlackList

• `Optional` **keywordsBlackList**: `string`[]

#### Defined in

index.d.ts:335

---

### mandatoryFields

• **mandatoryFields**: `ValidationFieldList`

#### Defined in

index.d.ts:330

---

### months

• `Optional` **months**: `string`[]

A list of month name to be used in the application

**`Memberof`**

ConfigDataType

#### Defined in

index.d.ts:363

---

### noManualKeywords

• `Optional` **noManualKeywords**: `boolean`

#### Defined in

index.d.ts:332

---

### noManualThemes

• `Optional` **noManualThemes**: `boolean`

#### Defined in

index.d.ts:333

---

### openInExternalTerriaMapButtonText

• `Optional` **openInExternalTerriaMapButtonText**: `string`

#### Defined in

index.d.ts:382

---

### openInExternalTerriaMapTargetUrl

• `Optional` **openInExternalTerriaMapTargetUrl**: `string`

#### Defined in

index.d.ts:383

---

### openfaasBaseUrl

• `Optional` **openfaasBaseUrl**: `string`

#### Defined in

index.d.ts:336

---

### previewMapBaseUrl

• `Optional` **previewMapBaseUrl**: `string`

#### Defined in

index.d.ts:265

---

### previewMapFormatPerference

• `Optional` **previewMapFormatPerference**: `RawPreviewMapFormatPerferenceItem`[]

#### Defined in

index.d.ts:396

---

### previewMapUrl

• `Optional` **previewMapUrl**: `string`

#### Defined in

index.d.ts:287

---

### proxyUrl

• `Optional` **proxyUrl**: `string`

#### Defined in

index.d.ts:288

---

### registryApiBaseUrl

• `Optional` **registryApiBaseUrl**: `string`

#### Defined in

index.d.ts:267

---

### registryApiReadOnlyBaseUrl

• `Optional` **registryApiReadOnlyBaseUrl**: `string`

#### Defined in

index.d.ts:268

---

### registryFullApiUrl

• **registryFullApiUrl**: `string`

#### Defined in

index.d.ts:270

---

### registryReadOnlyApiUrl

• **registryReadOnlyApiUrl**: `string`

#### Defined in

index.d.ts:269

---

### rssUrl

• `Optional` **rssUrl**: `string`

#### Defined in

index.d.ts:289

---

### searchApiBaseUrl

• `Optional` **searchApiBaseUrl**: `string`

#### Defined in

index.d.ts:271

---

### searchApiUrl

• **searchApiUrl**: `string`

#### Defined in

index.d.ts:272

---

### showContactButtonForNoContactPointDataset

• `Optional` **showContactButtonForNoContactPointDataset**: `boolean`

#### Defined in

index.d.ts:397

---

### showNotificationBanner

• `Optional` **showNotificationBanner**: `boolean`

Whether or not the notification banner should be shown.

**`Memberof`**

ConfigDataType

#### Defined in

index.d.ts:234

---

### storageApiBaseUrl

• `Optional` **storageApiBaseUrl**: `string`

#### Defined in

index.d.ts:275

---

### storageApiUrl

• **storageApiUrl**: `string`

#### Defined in

index.d.ts:276

---

### supportExternalTerriaMapV7

• `Optional` **supportExternalTerriaMapV7**: `boolean`

#### Defined in

index.d.ts:381

---

### uiBaseUrl

• **uiBaseUrl**: `string`

The base url path where the web client will be served at.
E.g. when `uiBaseUrl`=`/`, the web client will served at `https://example.com/`.
When `uiBaseUrl`=`/abc/def`, the web client will served at `https://example.com/abc/def`.
Please note: this field only reflect where the wbe client / frontend application is served at.
It doesn't reflect where all APIs are served. To find out it, the value `baseUrl` field should be used.

**`Memberof`**

ConfigDataType

#### Defined in

index.d.ts:226

---

### useMagdaStorageByDefault

• **useMagdaStorageByDefault**: `boolean`

Whether or not the "use magda storage" option should be pre-selected on dataset editor UI.

**`Memberof`**

ConfigDataType

#### Defined in

index.d.ts:317

---

### vocabularyApiEndpoints

• **vocabularyApiEndpoints**: `string`[]

#### Defined in

index.d.ts:318
