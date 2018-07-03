import React, { Component } from "react";
import PropTypes from "prop-types";
import "./DataPreviewMap.css";
import DataPreviewMapOpenInNationalMapButton from "./DataPreviewMapOpenInNationalMapButton";
import { config } from "../config";
import { Medium, Small } from "./Responsive";
import Spinner from "../Components/Spinner";

export const defaultDataSourcePreference = [
    "WMS",
    "ESRI REST",
    "GeoJSON",
    "WFS",
    "csv-geo-au",
    "KML"
];

export const isSupportedFormat = function(format) {
    return (
        defaultDataSourcePreference
            .map(item => item.toLowerCase())
            .filter(item => format.trim() === item).length !== 0
    );
};

class DataPreviewMap extends Component {
    constructor(props) {
        super(props);
        this.state = {
            isInitLoading: true,
            isMapLoading: false,
            isMapPreviewAvailable: false,
            selectedDistribution: null
        };
        this.onIframeMessageReceived = this.onIframeMessageReceived.bind(this);
        this.iframeRef = null;
    }

    createStateFromProps(props) {
        this.iframeRef = null;

        if (!props.distributions || !props.distributions.length) {
            this.setState({
                isInitLoading: true,
                isMapLoading: false,
                isMapPreviewAvailable: false,
                selectedDistribution: null
            });
            return;
        }
        const selectedDistribution = this.determineDistribution(props);
        if (!selectedDistribution) {
            this.setState({
                isInitLoading: false,
                isMapPreviewAvailable: false,
                selectedDistribution: null
            });
            return;
        } else {
            this.setState({
                isInitLoading: false,
                isMapLoading: true,
                isMapPreviewAvailable: true,
                selectedDistribution: selectedDistribution
            });
        }
    }

    UNSAFE_componentWillMount() {
        this.createStateFromProps(this.props);
    }

    componentDidMount() {
        window.addEventListener("message", this.onIframeMessageReceived);
    }

    componentWillUnmount() {
        window.removeEventListener("message", this.onIframeMessageReceived);
    }

    UNSAFE_componentWillReceiveProps(props) {
        this.createStateFromProps(props);
    }

    createCatalogItemFromDistribution() {
        return {
            initSources: [
                {
                    catalog: [
                        {
                            name: this.state.selectedDistribution.title,
                            type: "magda-item",
                            url: config.baseUrl,
                            distributionId: this.state.selectedDistribution
                                .identifier,
                            isEnabled: true,
                            zoomOnEnable: true
                        }
                    ],
                    baseMapName: "Positron (Light)",
                    homeCamera: {
                        north: -8,
                        east: 158,
                        south: -45,
                        west: 109
                    }
                }
            ]
        };
    }

    determineDistribution(props) {
        const distributions = props.distributions;
        let dataSourcePreference = props.dataSourcePreference;
        if (!dataSourcePreference || !dataSourcePreference.length)
            dataSourcePreference = defaultDataSourcePreference;
        dataSourcePreference = dataSourcePreference.map(item =>
            item.toLowerCase()
        );
        if (!distributions || !distributions.length) return null;
        let selectedDis = null,
            perferenceOrder = -1;
        distributions
            .filter(
                item =>
                    (item.linkStatusAvailable && item.linkActive) ||
                    !item.linkStatusAvailable
            )
            .forEach(dis => {
                const format = dis.format.toLowerCase();
                const distributionPerferenceOrder = dataSourcePreference.indexOf(
                    format
                );
                if (distributionPerferenceOrder === -1) return;
                if (
                    perferenceOrder === -1 ||
                    distributionPerferenceOrder < perferenceOrder
                ) {
                    perferenceOrder = distributionPerferenceOrder;
                    selectedDis = dis;
                    return;
                }
            });
        return selectedDis;
    }

    onIframeMessageReceived(e) {
        if (
            this.state.isInitLoading ||
            !this.state.isMapPreviewAvailable ||
            !this.iframeRef
        )
            return;
        const iframeWindow = this.iframeRef.contentWindow;
        if (iframeWindow !== e.source) return;
        if (e.data === "ready") {
            iframeWindow.postMessage(
                this.createCatalogItemFromDistribution(),
                "*"
            );
            this.setState({
                isMapLoading: true
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
                isMapLoading: false
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
        if (!this.state.isInitLoading && !this.state.isMapPreviewAvailable)
            return null; //-- requested by Tash: hide the section if no data available

        // 3 states:
        // - loading component (isInitLoading === true) -> Show spinner
        // - loading terria (isMapLoading === true) -> Continue showing spinner and start loading map hidden
        // - everything loaded (neither true) -> No spinner, show map

        let iframe = null;
        if (!this.state.isInitLoading) {
            iframe = (
                <div style={{ position: "relative" }}>
                    <Medium>
                        <DataPreviewMapOpenInNationalMapButton
                            distribution={this.state.selectedDistribution}
                            buttonText="Open In National Map"
                            style={{
                                position: "absolute",
                                right: "10px",
                                top: "10px",
                                visibility: this.state.isMapLoading
                                    ? "hidden"
                                    : "visible"
                            }}
                        />
                    </Medium>
                    <Medium>
                        <iframe
                            title={this.state.selectedDistribution.title}
                            width="100%"
                            height="420px"
                            frameBorder="0"
                            src={
                                config.previewMapUrl +
                                "#mode=preview&hideExplorerPanel=1"
                            }
                            ref={f => (this.iframeRef = f)}
                            style={
                                this.state.isMapLoading
                                    ? {
                                          visibility: "hidden",
                                          position: "absolute"
                                      }
                                    : {}
                            }
                        />
                    </Medium>
                </div>
            );
        }
        return (
            <div className="data-preview-map">
                <h3>Map Preview</h3>
                {(this.state.isInitLoading || this.state.isMapLoading) && (
                    <div>
                        <Medium>
                            <Spinner width="100%" height="420px" />
                        </Medium>
                    </div>
                )}
                <Small>
                    <DataPreviewMapOpenInNationalMapButton
                        distribution={this.state.selectedDistribution}
                        style={{
                            position: "relative",
                            top: "10px",
                            visibility: "visible"
                        }}
                        buttonText="View in national map"
                    />
                </Small>
                <Medium>{iframe}</Medium>
            </div>
        );
    }
}

DataPreviewMap.propTypes = {
    distributions: PropTypes.arrayOf(PropTypes.object),
    dataSourcePreference: PropTypes.arrayOf(PropTypes.string),
    onLoadingStart: PropTypes.func,
    onLoadingEnd: PropTypes.func
};

export default DataPreviewMap;
