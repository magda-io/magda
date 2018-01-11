'use strict';

/*global require*/

// var AbsIttCatalogGroup = require('./AbsIttCatalogGroup');
// var AbsIttCatalogItem = require('./AbsIttCatalogItem');
const ArcGisCatalogGroup = require('terriajs/lib/Models/ArcGisCatalogGroup');
const ArcGisFeatureServerCatalogGroup = require('terriajs/lib/Models/ArcGisFeatureServerCatalogGroup');
const ArcGisFeatureServerCatalogItem = require('terriajs/lib/Models/ArcGisFeatureServerCatalogItem');
const ArcGisMapServerCatalogGroup = require('terriajs/lib/Models/ArcGisMapServerCatalogGroup');
const ArcGisMapServerCatalogItem = require('terriajs/lib/Models/ArcGisMapServerCatalogItem');
// var ResultPendingCatalogItem = require('./ResultPendingCatalogItem');
// var BingMapsCatalogItem = require('./BingMapsCatalogItem');
const CatalogGroup = require('terriajs/lib/Models/CatalogGroup');
// var CesiumTerrainCatalogItem = require('./CesiumTerrainCatalogItem');
const CkanCatalogGroup = require('terriajs/lib/Models/CkanCatalogGroup');
const CkanCatalogItem = require('terriajs/lib/Models/CkanCatalogItem');
// var CompositeCatalogItem = require('./CompositeCatalogItem');
// var createCatalogItemFromUrl = require('./createCatalogItemFromUrl');
const createCatalogMemberFromType = require('terriajs/lib/Models/createCatalogMemberFromType');
const CsvCatalogItem = require('terriajs/lib/Models/CsvCatalogItem');
// var CswCatalogGroup = require('./CswCatalogGroup');
// var CzmlCatalogItem = require('./CzmlCatalogItem');
// var GeoJsonCatalogItem = require('./GeoJsonCatalogItem');
// var GpxCatalogItem = require('./GpxCatalogItem');
// var KmlCatalogItem = require('./KmlCatalogItem');
// var OgrCatalogItem = require('./OgrCatalogItem');
// var OpenStreetMapCatalogItem = require('./OpenStreetMapCatalogItem');
const SdmxJsonCatalogItem = require('terriajs/lib/Models/SdmxJsonCatalogItem');
// var SensorObservationServiceCatalogItem = require('./SensorObservationServiceCatalogItem');
const SocrataCatalogGroup = require('terriajs/lib/Models/SocrataCatalogGroup');
// var UrlTemplateCatalogItem = require('./UrlTemplateCatalogItem');
// var WebFeatureServiceCatalogGroup = require('./WebFeatureServiceCatalogGroup');
// var WebFeatureServiceCatalogItem = require('./WebFeatureServiceCatalogItem');
const WebMapServiceCatalogGroup = require('terriajs/lib/Models/WebMapServiceCatalogGroup');
const WebMapServiceCatalogItem = require('terriajs/lib/Models/WebMapServiceCatalogItem');
// var WebMapTileServiceCatalogGroup = require('./WebMapTileServiceCatalogGroup');
// var WebMapTileServiceCatalogItem = require('./WebMapTileServiceCatalogItem');
// var WebProcessingServiceCatalogGroup = require('./WebProcessingServiceCatalogGroup');
// var WebProcessingServiceCatalogItem = require('./WebProcessingServiceCatalogItem');
// var WebProcessingServiceCatalogFunction = require('./WebProcessingServiceCatalogFunction');
// var WfsFeaturesCatalogGroup = require('./WfsFeaturesCatalogGroup');

export default function registerCatalogMembers() {
    // createCatalogMemberFromType.register('abs-itt', AbsIttCatalogItem);
    // createCatalogMemberFromType.register('abs-itt-dataset-list', AbsIttCatalogGroup);
    // createCatalogMemberFromType.register('result-pending', ResultPendingCatalogItem);
    // createCatalogMemberFromType.register('bing-maps', BingMapsCatalogItem);
    createCatalogMemberFromType.register('ckan', CkanCatalogGroup);
    createCatalogMemberFromType.register('ckan-resource', CkanCatalogItem);
    // createCatalogMemberFromType.register('composite', CompositeCatalogItem);
    createCatalogMemberFromType.register('csv', CsvCatalogItem);
    // createCatalogMemberFromType.register('csw', CswCatalogGroup);
    // createCatalogMemberFromType.register('cesium-terrain', CesiumTerrainCatalogItem);
    // createCatalogMemberFromType.register('czml', CzmlCatalogItem);
    createCatalogMemberFromType.register('esri-group', ArcGisCatalogGroup);
    createCatalogMemberFromType.register('esri-featureServer', ArcGisFeatureServerCatalogItem);
    createCatalogMemberFromType.register('esri-featureServer-group', ArcGisFeatureServerCatalogGroup);
    createCatalogMemberFromType.register('esri-mapServer', ArcGisMapServerCatalogItem);
    createCatalogMemberFromType.register('esri-mapServer-group', ArcGisMapServerCatalogGroup);
    // createCatalogMemberFromType.register('geojson', GeoJsonCatalogItem);
    // createCatalogMemberFromType.register('gpx', GpxCatalogItem);
    createCatalogMemberFromType.register('group', CatalogGroup);
    // createCatalogMemberFromType.register('kml', KmlCatalogItem);
    // createCatalogMemberFromType.register('kmz', KmlCatalogItem);
    // createCatalogMemberFromType.register('ogr', OgrCatalogItem);
    // createCatalogMemberFromType.register('open-street-map', OpenStreetMapCatalogItem);
    createCatalogMemberFromType.register('sdmx-json', SdmxJsonCatalogItem);
    createCatalogMemberFromType.register('socrata', SocrataCatalogGroup);
    // createCatalogMemberFromType.register('sos', SensorObservationServiceCatalogItem);
    // createCatalogMemberFromType.register('url-template', UrlTemplateCatalogItem);
    // createCatalogMemberFromType.register('wfs', WebFeatureServiceCatalogItem);
    // createCatalogMemberFromType.register('wfs-features-group', WfsFeaturesCatalogGroup);
    // createCatalogMemberFromType.register('wfs-getCapabilities', WebFeatureServiceCatalogGroup);
    createCatalogMemberFromType.register('wms', WebMapServiceCatalogItem);
    createCatalogMemberFromType.register('wms-getCapabilities', WebMapServiceCatalogGroup);
    // createCatalogMemberFromType.register('wmts', WebMapTileServiceCatalogItem);
    // createCatalogMemberFromType.register('wmts-getCapabilities', WebMapTileServiceCatalogGroup);
    // createCatalogMemberFromType.register('wps-getCapabilities', WebProcessingServiceCatalogGroup);
    // createCatalogMemberFromType.register('wps-result', WebProcessingServiceCatalogItem);
    // createCatalogMemberFromType.register('wps', WebProcessingServiceCatalogFunction);

    // createCatalogItemFromUrl.register(matchesExtension('csv'), CsvCatalogItem);
    // createCatalogItemFromUrl.register(matchesExtension('czm'), CzmlCatalogItem);
    // createCatalogItemFromUrl.register(matchesExtension('czml'), CzmlCatalogItem);
    // createCatalogItemFromUrl.register(matchesExtension('geojson'), GeoJsonCatalogItem);
    // createCatalogItemFromUrl.register(matchesExtension('gpx'), GpxCatalogItem);
    // createCatalogItemFromUrl.register(matchesExtension('json'), GeoJsonCatalogItem);
    // createCatalogItemFromUrl.register(matchesExtension('kml'), KmlCatalogItem);
    // createCatalogItemFromUrl.register(matchesExtension('kmz'), KmlCatalogItem);
    // createCatalogItemFromUrl.register(matchesExtension('topojson'), GeoJsonCatalogItem);

    // // These items work by trying to match a URL, then loading the data. If it fails, they move on.
    // createCatalogItemFromUrl.register(matchesUrl(/\/WMTS\b/i), WebMapTileServiceCatalogGroup, true);
    // createCatalogItemFromUrl.register(matchesUrl(/\/wfs/i), WebFeatureServiceCatalogGroup, true);
    // createCatalogItemFromUrl.register(matchesUrl(/\/wms/i), WebMapServiceCatalogGroup, true);
    // createCatalogItemFromUrl.register(matchesUrl(/\/arcgis\/rest\/.*\/MapServer\/\d+\b/i), ArcGisMapServerCatalogItem, true);
    // createCatalogItemFromUrl.register(matchesUrl(/\/arcgis\/rest\/.*\/FeatureServer\/\d+\b/i), ArcGisFeatureServerCatalogItem, true);
    // createCatalogItemFromUrl.register(matchesUrl(/\/arcgis\/rest\/.*\/MapServer(\/.*)?$/i), ArcGisMapServerCatalogGroup, true);
    // createCatalogItemFromUrl.register(matchesUrl(/\/arcgis\/rest\/.*\/FeatureServer(\/.*)?$/i), ArcGisFeatureServerCatalogGroup, true);
    // createCatalogItemFromUrl.register(matchesUrl(/\/arcgis\/rest\/.*\/\d+\b/i), ArcGisMapServerCatalogItem, true);
    // createCatalogItemFromUrl.register(matchesUrl(/\/ArcGis\/rest\//i), ArcGisCatalogGroup, true);
    // createCatalogItemFromUrl.register(matchesUrl(/\/sdmx-json\//i), SdmxJsonCatalogItem, true);

    // // These don't even try to match a URL, they're just total fallbacks. We really, really want something to work.
    // createCatalogItemFromUrl.register(undefined, WebMapServiceCatalogGroup, true);
    // createCatalogItemFromUrl.register(undefined, WebFeatureServiceCatalogGroup, true);
    // createCatalogItemFromUrl.register(undefined, ArcGisMapServerCatalogItem, true);
    // createCatalogItemFromUrl.register(undefined, ArcGisMapServerCatalogGroup, true);
    // createCatalogItemFromUrl.register(undefined, ArcGisCatalogGroup, true);
    // createCatalogItemFromUrl.register(undefined, ArcGisFeatureServerCatalogItem, true);
    // createCatalogItemFromUrl.register(undefined, ArcGisFeatureServerCatalogGroup, true);
};

// function matchesExtension(extension) {
//     var regex = new RegExp('\\.' + extension + '$', 'i');
//     return function(url) {
//         return url.match(regex);
//     };
// }

// function matchesUrl(regex) {
//     return /./.test.bind(regex);
// }

// Uncomment this if you need to deprecated a catalog item type.
// function createDeprecatedConstructor(deprecatedName, CatalogItemConstructor) {
//     return function(terria) {
//         deprecationWarning(deprecatedName, 'The catalog member type "' + deprecatedName + '" has been deprecated.  Please update your catalog to use "' + CatalogItemConstructor.prototype.type + '" instead.');
//         return new CatalogItemConstructor(terria);
//     };
// }
