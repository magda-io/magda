import React, { Component } from "react";
import DataPreviewVis from "../../UI/DataPreviewVis";
import DataPreviewMap from "../../UI/DataPreviewMap";
import PropTypes from "prop-types";
import "./DatasetPreview.css";

export default class DatasetPreview extends Component {
    getDistributionForVis(distributions) {
        if (!distributions || distributions.length === 0) {
            return null;
        }
        return distributions.find(d => d.linkStatusAvailable && d.linkActive);
    }
    render() {
        const distributions = this.props.dataset.distributions;

        return (
            <div className="dataset-preview container">
                <DataPreviewVis
                    distribution={this.getDistributionForVis(distributions)}
                />
                <DataPreviewMap dataset={this.props.dataset} />
            </div>
        );
    }
}

DatasetPreview.propTypes = {
    dataset: PropTypes.object
};
