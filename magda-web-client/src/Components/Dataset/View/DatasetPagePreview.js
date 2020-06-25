import React, { Component } from "react";
import DataPreviewVis from "Components/Common/DataPreviewVis";
import DataPreviewMap from "Components/Common/DataPreviewMap";
import PropTypes from "prop-types";
import "./DatasetPagePreview.scss";

export default class DatasetPagePreview extends Component {
    getDistributionForVis(distributions) {
        if (!distributions || distributions?.length === 0) {
            return null;
        }
        return distributions.find((d) => {
            // Checking if the distribution has a url
            if (!(typeof d === "string") && !d.downloadURL && !d.accessURL) {
                return null;
            }
            return /(^|\W+)csv(\W+|$)/i.test(d.format);
        });
    }

    render() {
        const distributions = this.props.dataset.distributions;
        return (
            <div className="dataset-preview">
                <DataPreviewVis
                    location={this.props.location}
                    dataset={this.props.dataset}
                    distribution={this.getDistributionForVis(distributions)}
                />
                <DataPreviewMap distributions={distributions} />
            </div>
        );
    }
}

DatasetPagePreview.propTypes = {
    dataset: PropTypes.object
};
