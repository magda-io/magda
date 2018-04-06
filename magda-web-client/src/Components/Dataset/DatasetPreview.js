import React, { Component } from "react";
import DataPreviewVis from "../../UI/DataPreviewVis";
import DataPreviewMap from "../../UI/DataPreviewMap";
import PropTypes from "prop-types";
import "./DatasetPreview.css";

export const defaultDataSourcePreference = [
    "WMS",
    "GeoJSON",
    "WFS",
    "csv-geo-au",
    "KML"
];

export default class DatasetPreview extends Component {
    getDistributionForVis(distributions) {
        if (!distributions || distributions.length === 0) {
            return null;
        }
        return distributions.find(d => d.linkStatusAvailable && d.linkActive);
    }
    getDistributionForMap(distributions) {
        let dataSourcePreference = this.props.dataSourcePreference;
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

    render() {
        const distributions = this.props.dataset.distributions;
        const mappedDistribution = this.getDistributionForMap(distributions);
        return (
            <div className="dataset-preview container">
                <DataPreviewVis
                    distribution={this.getDistributionForVis(distributions)}
                />
                {mappedDistribution != null && (
                    <DataPreviewMap distribution={mappedDistribution} />
                )}
            </div>
        );
    }
}

DatasetPreview.propTypes = {
    dataset: PropTypes.object,
    dataSourcePreference: PropTypes.arrayOf(PropTypes.string)
};
