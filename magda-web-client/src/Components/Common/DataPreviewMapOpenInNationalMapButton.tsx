import React, { Component } from "react";
import browser from "browser-detect";
import { config, DATASETS_BUCKET } from "../../config";
import "./DataPreviewMapOpenInNationalMapButton.scss";
import { BrowserDetectInfo } from "browser-detect/dist/types/browser-detect.interface";
import { ParsedDistribution } from "../../helpers/record";
import {
    FullMapTarget,
    getFullMapTarget,
    getTargetOrigin
} from "../../helpers/externalTerriaMap";
import { createPreviewMapStartData } from "../../helpers/previewMapStartData";
import URI from "urijs";

const DEFAULT_BUILT_IN_BUTTON_TEXT = "Open full map";

type PropsType = {
    distribution: ParsedDistribution;
    /** Label for the legacy external-TerriaMap path. */
    buttonText: string;
    selectedWmsWfsGroupItemName?: string;
    isWms?: boolean;
    style: {
        [key: string]: any;
    };
};

class DataPreviewMapOpenInNationalMapButton extends Component<PropsType> {
    private browser: BrowserDetectInfo;
    private winRef: Window | null;
    private shouldRender: boolean;
    // Built-in full map, a configured external TerriaMap, or undefined.
    private target: FullMapTarget | undefined;

    constructor(props) {
        super(props);
        this.state = {};
        this.onPopUpMessageReceived = this.onPopUpMessageReceived.bind(this);
        this.winRef = null;
        this.browser = browser();
        // Without a configured remote TerriaMap, open the deployment's own
        // preview-map module in full mode (the historical nationalmap.gov.au
        // default has been discontinued).
        this.target = getFullMapTarget(config);
        this.shouldRender = this.target
            ? this.target.kind === "builtIn"
                ? // needs the postMessage handshake, which legacy IE skips
                  !this.isLegacyIe()
                : this.externalTargetSupported()
            : false;
    }

    private isLegacyIe() {
        return !!(
            this.browser.name === "ie" &&
            this.browser?.versionNumber &&
            this.browser.versionNumber < 12
        );
    }

    private externalTargetSupported() {
        // support v7 turned on or not IE 11
        return (
            config?.supportExternalTerriaMapV7 === true || !this.isLegacyIe()
        );
    }

    createBuiltInStartData() {
        const { distribution, selectedWmsWfsGroupItemName, isWms } = this.props;
        return createPreviewMapStartData({
            title: distribution?.title,
            distributionId: distribution?.identifier,
            baseUrl: config.baseUrl,
            storageApiUrl: config.storageApiBaseUrl,
            defaultBucket: DATASETS_BUCKET,
            corsDomain: URI(config.baseExternalUrl).hostname(),
            selectedWmsWfsGroupItemName,
            isWms
        });
    }

    componentDidMount() {
        if (
            this.browser.name === "ie" &&
            this.browser?.versionNumber &&
            this.browser?.versionNumber < 12
        )
            return;
        window.addEventListener("message", this.onPopUpMessageReceived);
    }

    componentWillUnmount() {
        if (
            this.browser.name === "ie" &&
            this.browser?.versionNumber &&
            this.browser.versionNumber < 12
        )
            return;
        window.removeEventListener("message", this.onPopUpMessageReceived);
    }

    createCatalogItemFromDistribution(withoutBaseMap = false) {
        const { distribution } = this.props;
        let catConfig;

        if (config?.supportExternalTerriaMapV7 === true) {
            catConfig = {
                version: "0.0.3",
                initSources: [
                    {
                        catalog: [
                            {
                                name: distribution?.title,
                                type: "magda-item",
                                distributionId: distribution?.identifier,
                                url: config.baseExternalUrl,
                                isEnabled: true,
                                zoomOnEnable: true
                            }
                        ]
                    }
                ]
            };
        } else {
            const dataUrl = distribution?.downloadURL
                ? distribution.downloadURL
                : distribution.accessURL;

            const id = "external-postMessage-" + distribution?.identifier;
            const queries =
                typeof dataUrl === "string" ? URI(dataUrl).query(true) : {};
            const layers = queries["LAYERS"]
                ? queries["LAYERS"]
                : queries["layers"]
                ? queries["layers"]
                : queries["Layers"];

            const type =
                distribution?.format?.toLowerCase() === "wms"
                    ? layers
                        ? "wms"
                        : "wms-group"
                    : undefined;

            const terriaAspect: any = type
                ? {
                      aspects: {
                          terria: {
                              definition: {
                                  name:
                                      distribution?.title +
                                      " (Added by external application)",
                                  url: dataUrl
                              },
                              id: id,
                              type: type
                          }
                      }
                  }
                : undefined;

            if (type === "wms") {
                terriaAspect.aspects.terria.definition.layers = layers;
            }

            catConfig = {
                version: "8.0.0",
                initSources: [
                    {
                        stratum: "user",
                        catalog: [
                            {
                                name: distribution?.title,
                                type: "magda",
                                recordId: distribution?.identifier,
                                url: config.baseExternalUrl,
                                addOrOverrideAspects: terriaAspect,
                                id: id
                            }
                        ],
                        workbench: type === "wms-group" ? [] : [id],
                        previewedItemId: type === "wms-group" ? id : undefined
                    }
                ]
            };
        }

        if (!withoutBaseMap) {
            //--- will not set baseMap if pass config by URL
            catConfig.initSources[0].baseMapName = "Positron (Light)";
        }
        return catConfig;
    }

    onButtonClick() {
        const target = this.target;
        if (!target) {
            // Button is only rendered when a target exists; guard defensively
            // in case of an unexpected click.
            return;
        }
        const targetUrl = target.url;
        if (target.kind === "builtIn") {
            // Load without `#mode=preview` so the full TerriaJS chrome is shown.
            // The opened window posts "ready" to its opener (us), and we reply
            // with the same `magda-item` start data as the embedded preview.
            const newWinRef = window.open(targetUrl, "_blank");
            if (!newWinRef) {
                this.winRef = null;
                alert(
                    "Unable to open the full map as it was blocked by a popup blocker. Please allow this site to open popups in your browser and try again."
                );
                return;
            }
            this.winRef = newWinRef;
            return;
        }
        if (this.isLegacyIe()) {
            window.open(
                `${targetUrl}#start=` +
                    encodeURIComponent(
                        JSON.stringify(
                            this.createCatalogItemFromDistribution(true)
                        )
                    ),
                "_blank"
            );
            return;
        }
        const newWinRef = window.open(targetUrl, "_blank");
        if (!newWinRef) {
            this.winRef = null;
            alert(
                "Unable to open on National Map as it was blocked by a popup blocker. Please allow this site to open popups in your browser and try again."
            );
            return;
        }
        this.winRef = newWinRef;
    }

    onPopUpMessageReceived(e) {
        if (!this.winRef || this.winRef !== e.source || e.data !== "ready") {
            return;
        }
        if (this.target?.kind === "builtIn") {
            const targetOrigin = getTargetOrigin(
                this.target.url,
                window.location.href
            );
            // Only answer our own full-map window, never another origin.
            if (e.origin !== targetOrigin) return;
            this.winRef.postMessage(
                this.createBuiltInStartData(),
                targetOrigin
            );
            return;
        }
        this.winRef.postMessage(this.createCatalogItemFromDistribution(), "*");
    }

    render() {
        if (!this.shouldRender) {
            return null;
        }
        const buttonText =
            config?.openInExternalTerriaMapButtonText ||
            (this.target?.kind === "builtIn"
                ? DEFAULT_BUILT_IN_BUTTON_TEXT
                : this.props.buttonText);
        return (
            <div style={this.props.style}>
                <button
                    className="open-in-national-map-button au-btn au-btn--secondary"
                    onClick={() => this.onButtonClick()}
                >
                    <div className="rectangle-2" />
                    <div className="rectangle-1" />
                    <div className="open-national-map-button-text">
                        {buttonText}
                    </div>
                </button>
            </div>
        );
    }
}

export default DataPreviewMapOpenInNationalMapButton;
