import React, { Component } from "react";
import browser from "browser-detect";
import { config } from "../../config";
import "./DataPreviewMapOpenInNationalMapButton.scss";
import { BrowserDetectInfo } from "browser-detect/dist/types/browser-detect.interface";
import { ParsedDistribution } from "helpers/record";

type PropsType = {
    distribution: ParsedDistribution;
    buttonText: string;
    style: {
        [key: string]: any;
    };
};

const DEFAULT_TARGET_URL = "https://nationalmap.gov.au/";

class DataPreviewMapOpenInNationalMapButton extends Component<PropsType> {
    private browser: BrowserDetectInfo;
    private winRef: Window | null;

    constructor(props) {
        super(props);
        this.state = {};
        this.onPopUpMessageReceived = this.onPopUpMessageReceived.bind(this);
        this.winRef = null;
        this.browser = browser();
    }

    componentDidMount() {
        if (this.browser.name === "ie" && this.browser?.versionNumber! < 12)
            return;
        window.addEventListener("message", this.onPopUpMessageReceived);
    }

    componentWillUnmount() {
        if (this.browser.name === "ie" && this.browser?.versionNumber! < 12)
            return;
        window.removeEventListener("message", this.onPopUpMessageReceived);
    }

    createCatalogItemFromDistribution(withoutBaseMap = false) {
        const { distribution } = this.props;
        let catConfig;

        if (config?.supportExternalTerriaMapV7 === true) {
            catConfig = {
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
            const dga_id_prefix = "data.gov.au-postMessage-";
            const id = dga_id_prefix + distribution?.identifier;
            catConfig = {
                initSources: [
                    {
                        catalog: [
                            {
                                name: distribution?.title,
                                type: "magda",
                                recordId: distribution?.identifier,
                                url: config.baseExternalUrl,
                                id
                            }
                        ],
                        workbench: [id]
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
        const targetUrl = config?.openInExternalTerriaMapTargetUrl
            ? config.openInExternalTerriaMapTargetUrl
            : DEFAULT_TARGET_URL;
        if (this.browser.name === "ie" && this.browser?.versionNumber! < 12) {
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
        if (this.winRef !== e.source || e.data !== "ready") return;
        this?.winRef?.postMessage(
            this.createCatalogItemFromDistribution(),
            "*"
        );
    }

    render() {
        return (
            <div style={this.props.style}>
                <button
                    className="open-in-national-map-button au-btn au-btn--secondary"
                    onClick={() => this.onButtonClick()}
                >
                    <div className="rectangle-2" />
                    <div className="rectangle-1" />
                    <div className="open-national-map-button-text">
                        {config?.openInExternalTerriaMapButtonText
                            ? config.openInExternalTerriaMapButtonText
                            : this.props.buttonText}
                    </div>
                </button>
            </div>
        );
    }
}

export default DataPreviewMapOpenInNationalMapButton;
