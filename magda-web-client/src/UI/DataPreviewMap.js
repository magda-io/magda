import React, { Component } from "react";
import PropTypes from "prop-types";
import "./DataPreviewMap.css";
import DataPreviewMapOpenInNationalMapButton from "./DataPreviewMapOpenInNationalMapButton";
import { config } from "../config";

export const defaultDataSourcePreference = [
    "GeoJSON",
    "WFS",
    "WMS",
    "csv-geo-au",
    "KML"
];

class DataPreviewMap extends Component {
    constructor(props) {
        super(props);
        this.state = {
            isInitLoading: true,
            isMapPreviewAvailable: false,
            selectedDistribution: null
        };
        this.onIframeMessageReceived = this.onIframeMessageReceived.bind(this);
        this.iframeRef = null;
    }

    createStateFromProps(props) {
        this.iframeRef = null;

        const { identifier } = props.dataset;
        if (identifier === "") {
            this.setState({
                isInitLoading: true,
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
                isMapPreviewAvailable: true,
                selectedDistribution: selectedDistribution
            });
        }
    }

    componentWillMount() {
        this.createStateFromProps(this.props);
    }

    componentDidMount() {
        window.addEventListener("message", this.onIframeMessageReceived);
    }

    componentWillUnmount() {
        window.removeEventListener("message", this.onIframeMessageReceived);
    }

    componentWillReceiveProps(props) {
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
                            url: "/",
                            distributionId: this.state.selectedDistribution
                                .identifier,
                            isEnabled: true,
                            zoomOnEnable: true
                        }
                    ],
                    baseMapName: "Positron (Light)"
                }
            ]
        };
    }

    determineDistribution(props) {
        const distributions = props.dataset.distributions;
        let dataSourcePreference = props.dataset.dataSourcePreference;
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
            if (this.props.onLoadingStart) {
                try {
                    this.props.onLoadingStart();
                } catch (e) {
                    console.log(e);
                }
            }
            return;
        } else if (e.data === "loading complete") {
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
        if (this.state.isInitLoading)
            return (
                <div className="data-preview-map">
                    <h3>Map Preview</h3>
                    Loading....
                </div>
            );

        if (!this.state.isMapPreviewAvailable)
            return (
                <div className="data-preview-map">
                    <h3>Map Preview</h3>
                    No map preview available
                </div>
            );

        return (
            <div className="data-preview-map">
                <h3>Map Preview</h3>
                <div style={{ position: "relative" }}>
                    <DataPreviewMapOpenInNationalMapButton
                        distribution={this.state.selectedDistribution}
                        style={{
                            position: "absolute",
                            right: "10px",
                            top: "10px"
                        }}
                    />
                    <iframe
                        title={this.state.selectedDistribution.title}
                        width="100%"
                        height="420px"
                        frameBorder="0"
                        src={
                            config.previewMapUrl +
                            "#mode=preview&hideExplorerPanel=1&clean"
                        }
                        ref={f => (this.iframeRef = f)}
                    />
                </div>
            </div>
        );
    }
}

DataPreviewMap.propTypes = {
    dataset: PropTypes.object,
    dataSourcePreference: PropTypes.arrayOf(PropTypes.string),
    onLoadingStart: PropTypes.func,
    onLoadingEnd: PropTypes.func
};

export default DataPreviewMap;
