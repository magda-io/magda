"use strict";

/*global require,window */

var terriaOptions = {
    baseUrl: "build/TerriaJS"
};
var configuration = {
    bingMapsKey: undefined // use Cesium key
};

// Check browser compatibility early on.
// A very old browser (e.g. Internet Explorer 8) will fail on requiring-in many of the modules below.
// 'ui' is the name of the DOM element that should contain the error popup if the browser is not compatible
//var checkBrowserCompatibility = require('terriajs/lib/ViewModels/checkBrowserCompatibility');

// checkBrowserCompatibility('ui');
import GoogleAnalytics from "terriajs/lib/Core/GoogleAnalytics";
import ShareDataService from "terriajs/lib/Models/ShareDataService";
import OgrCatalogItem from "terriajs/lib/Models/OgrCatalogItem";
import raiseErrorToUser from "terriajs/lib/Models/raiseErrorToUser";
import registerAnalytics from "terriajs/lib/Models/registerAnalytics";
import registerCatalogMembers from "terriajs/lib/Models/registerCatalogMembers";
import registerCustomComponentTypes from "terriajs/lib/ReactViews/Custom/registerCustomComponentTypes";
import Terria from "terriajs/lib/Models/Terria";
import updateApplicationOnHashChange from "terriajs/lib/ViewModels/updateApplicationOnHashChange";
import updateApplicationOnMessageFromParentWindow from "terriajs/lib/ViewModels/updateApplicationOnMessageFromParentWindow";
import ViewState from "terriajs/lib/ReactViewModels/ViewState";
import BingMapsSearchProviderViewModel from "terriajs/lib/ViewModels/BingMapsSearchProviderViewModel.js";
import GazetteerSearchProviderViewModel from "terriajs/lib/ViewModels/GazetteerSearchProviderViewModel.js";
import GnafSearchProviderViewModel from "terriajs/lib/ViewModels/GnafSearchProviderViewModel.js";
import defined from "terriajs-cesium/Source/Core/defined";
import render from "./lib/Views/render";
import knockout from "terriajs-cesium/Source/ThirdParty/knockout";

import createCatalogMemberFromType from "terriajs/lib/Models/createCatalogMemberFromType";
import MagdaCatalogItem from "./lib/Models/MagdaCatalogItem";
import ViewerMode from "terriajs/lib/Models/ViewerMode.js";

// Tell the OGR catalog item where to find its conversion service.  If you're not using OgrCatalogItem you can remove this.
OgrCatalogItem.conversionServiceBaseUrl =
    configuration.conversionServiceBaseUrl;

// Register all types of catalog members in the core TerriaJS.  If you only want to register a subset of them
// (i.e. to reduce the size of your application if you don't actually use them all), feel free to copy a subset of
// the code in the registerCatalogMembers function here instead.
registerCatalogMembers();
createCatalogMemberFromType.register("magda-item", MagdaCatalogItem);
registerAnalytics();

terriaOptions.analytics = new GoogleAnalytics();
terriaOptions.viewerMode = ViewerMode.CesiumEllipsoid;

// Construct the TerriaJS application, arrange to show errors to the user, and start it up.
var terria = new Terria(terriaOptions);

// Register custom components in the core TerriaJS.  If you only want to register a subset of them, or to add your own,
// insert your custom version of the code in the registerCustomComponentTypes function here instead.
registerCustomComponentTypes(terria);

terria.welcome =
    '<h3>Terria<sup>TM</sup> is a spatial data platform that provides spatial predictive analytics</h3><div class="body-copy"><p>This interactive map uses TerriaJS<sup>TM</sup>, an open source software library developed by Data61 for building rich, web-based geospatial data explorers.  It uses Cesium<sup>TM</sup> open source 3D globe viewing software.  TerriaJS<sup>TM</sup> is used for the official Australian Government NationalMap and many other sites rich in the use of spatial data.</p><p>This map also uses Terria<sup>TM</sup> Inference Engine, a cloud-based platform for making probabilistic predictions using data in a web-based mapping environment. Terria<sup>TM</sup> Inference Engine uses state of the art machine learning algorithms developed by Data61 and designed specifically for large-scale spatial inference.</p></div>';

// Create the ViewState before terria.start so that errors have somewhere to go.
const viewState = new ViewState({
    terria: terria
});

knockout.getObservable(viewState, "notifications").subscribe(function() {
    if (!viewState.notifications || !viewState.notifications.length) return;
    const notification = viewState.notifications.shift();
    if (!notification) return;
    let msg = "";
    if (typeof notification === "string") msg = notification;
    else if (notification.message) msg = notification.message;
    else msg = String(notification);
    if (!console || !console.log) return;
    console.log(`Preview Map notifcation: \n ${msg}`);
});

if (process.env.NODE_ENV === "development") {
    window.viewState = viewState;
}

// If we're running in dev mode, disable the built style sheet as we'll be using the webpack style loader.
// Note that if the first stylesheet stops being nationalmap.css then this will have to change.
if (process.env.NODE_ENV !== "production" && module.hot) {
    document.styleSheets[0].disabled = true;
}

terria
    .start({
        // If you don't want the user to be able to control catalog loading via the URL, remove the applicationUrl property below
        // as well as the call to "updateApplicationOnHashChange" further down.
        applicationUrl: window.location,
        configUrl: "config.json",
        shareDataService: new ShareDataService({
            terria: terria
        })
    })
    .otherwise(function(e) {
        raiseErrorToUser(terria, e);
    })
    .always(function() {
        try {
            configuration.bingMapsKey = terria.configParameters.bingMapsKey
                ? terria.configParameters.bingMapsKey
                : configuration.bingMapsKey;

            viewState.searchState.locationSearchProviders = [
                new BingMapsSearchProviderViewModel({
                    terria: terria,
                    key: configuration.bingMapsKey
                }),
                new GazetteerSearchProviderViewModel({ terria }),
                new GnafSearchProviderViewModel({ terria })
            ];

            // Automatically update Terria (load new catalogs, etc.) when the hash part of the URL changes.
            updateApplicationOnHashChange(terria, window);
            updateApplicationOnMessageFromParentWindow(terria, window);

            //temp
            var createAustraliaBaseMapOptions = require("terriajs/lib/ViewModels/createAustraliaBaseMapOptions");
            var createGlobalBaseMapOptions = require("terriajs/lib/ViewModels/createGlobalBaseMapOptions");
            var selectBaseMap = require("terriajs/lib/ViewModels/selectBaseMap");
            // Create the various base map options.
            var australiaBaseMaps = createAustraliaBaseMapOptions(terria);
            var globalBaseMaps = createGlobalBaseMapOptions(
                terria,
                configuration.bingMapsKey
            );

            var allBaseMaps = australiaBaseMaps.concat(globalBaseMaps);
            selectBaseMap(
                terria,
                allBaseMaps,
                "Bing Maps Aerial with Labels",
                true
            );

            // Show a modal disclaimer before user can do anything else.
            if (defined(terria.configParameters.globalDisclaimer)) {
                var globalDisclaimer = terria.configParameters.globalDisclaimer;
                var hostname = window.location.hostname;
                if (
                    globalDisclaimer.enableOnLocalhost ||
                    hostname.indexOf("localhost") === -1
                ) {
                    var message = "";
                    // Sometimes we want to show a preamble if the user is viewing a site other than the official production instance.
                    // This can be expressed as a devHostRegex ("any site starting with staging.") or a negative prodHostRegex ("any site not ending in .gov.au")
                    if (
                        (defined(globalDisclaimer.devHostRegex) &&
                            hostname.match(globalDisclaimer.devHostRegex)) ||
                        (defined(globalDisclaimer.prodHostRegex) &&
                            !hostname.match(globalDisclaimer.prodHostRegex))
                    ) {
                        message += require("./lib/Views/DevelopmentDisclaimerPreamble.html");
                    }
                    message += require("./lib/Views/GlobalDisclaimer.html");

                    var options = {
                        title:
                            globalDisclaimer.title !== undefined
                                ? globalDisclaimer.title
                                : "Warning",
                        confirmText: globalDisclaimer.buttonTitle || "Ok",
                        width: 600,
                        height: 550,
                        message: message,
                        horizontalPadding: 100
                    };
                    viewState.notifications.push(options);
                }
            }

            render(terria, allBaseMaps, viewState);
        } catch (e) {
            console.error(e);
            console.error(e.stack);
        }
    });
