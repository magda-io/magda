import React, { Component } from "react";
import PropTypes from "prop-types";
import "./DataPreviewMap.css";
import DataPreviewMapOpenInNationalMapButton from "./DataPreviewMapOpenInNationalMapButton";
import { config } from "../config";
import { Medium, Small } from "./Responsive";
import Spinner from "../Components/Spinner";

export const defaultDataSourcePreference = [
    "WMS",
    "GeoJSON",
    "WFS",
    "csv-geo-au",
    "KML"
];

class DataPreviewMap extends Component {
    constructor(props) {
        super(props);
        this.state = {
            loading: true
        };
        this.onIframeMessageReceived = this.onIframeMessageReceived.bind(this);
        this.iframeRef = null;
    }

    componentDidMount() {
        window.addEventListener("message", this.onIframeMessageReceived);
    }

    componentWillUnmount() {
        window.removeEventListener("message", this.onIframeMessageReceived);
    }

    createCatalogItemFromDistribution() {
        return {
            initSources: [
                {
                    catalog: [
                        {
                            name: this.props.distribution.title,
                            type: "magda-item",
                            url: "/",
                            distributionId: this.props.distribution.identifier,
                            isEnabled: true,
                            zoomOnEnable: true
                        }
                    ],
                    baseMapName: "Positron (Light)"
                }
            ]
        };
    }

    onIframeMessageReceived(e) {
        if (!this.iframeRef) return;
        const iframeWindow = this.iframeRef.contentWindow;
        if (iframeWindow !== e.source) return;
        if (e.data === "ready") {
            iframeWindow.postMessage(
                this.createCatalogItemFromDistribution(),
                "*"
            );
            this.setState({
                loading: true
            });
            if (this.props.onLoadingStart) {
                try {
                    this.props.onLoadingStart();
                } catch (e) {
                    console.log(e);
                }
            }
            return;
        } else if (e.data === "loading complete") {
            this.setState({
                loading: false
            });
            if (this.props.onLoadingEnd) {
                try {
                    this.props.onLoadingEnd();
                } catch (e) {
                    console.log(e);
                }
            }
            return;
        }
    }

    render() {
        // 3 states:
        // - loading terria (isMapLoading === true) -> Show spinner and start loading map hidden
        // - everything loaded (neither true) -> No spinner, show map
        return (
            <div className="data-preview-map">
                <h3>Map Preview</h3>
                {this.state.loading && (
                    <div>
                        <Medium>
                            <Spinner width="100%" height="420px" />
                        </Medium>
                        <Small>
                            <Spinner width="100%" height="200px" />
                        </Small>
                    </div>
                )}
                <div style={{ position: "relative" }}>
                    <DataPreviewMapOpenInNationalMapButton
                        distribution={this.props.distribution}
                        style={{
                            position: "absolute",
                            right: "10px",
                            top: "10px",
                            display: this.state.loading ? "none" : "initial"
                        }}
                    />
                    <Medium>
                        <iframe
                            title={this.props.distribution.title}
                            width="100%"
                            height="420px"
                            frameBorder="0"
                            src={
                                config.previewMapUrl +
                                "#mode=preview&hideExplorerPanel=1&clean"
                            }
                            ref={f => (this.iframeRef = f)}
                            style={{
                                display: this.state.loading ? "none" : "initial"
                            }}
                        />
                    </Medium>
                    <Small>
                        <iframe
                            title={this.props.distribution.title}
                            width="100%"
                            height="200px"
                            frameBorder="0"
                            src={
                                config.previewMapUrl +
                                "#mode=preview&hideExplorerPanel=1&clean"
                            }
                            ref={f => (this.iframeRef = f)}
                            style={{
                                visibility: this.state.loading
                                    ? "hidden"
                                    : "visible"
                            }}
                        />
                    </Small>
                </div>
            </div>
        );
    }
}

DataPreviewMap.propTypes = {
    distribution: PropTypes.object,
    onLoadingStart: PropTypes.func,
    onLoadingEnd: PropTypes.func
};

export default DataPreviewMap;
