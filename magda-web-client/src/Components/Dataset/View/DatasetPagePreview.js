import React, { Component } from "react";
import DataPreviewVis from "Components/Common/DataPreviewVis";
import DataPreviewMap from "Components/Common/DataPreviewMap";
import { getPluginExtraVisualisationSections } from "../../../externalPluginComponents";
import PropTypes from "prop-types";
import "./DatasetPagePreview.scss";

const extraVisualisationSections = getPluginExtraVisualisationSections();
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
                <DataPreviewMap
                    dataset={this.props.dataset}
                    distributions={distributions}
                />
                {extraVisualisationSections?.length
                    ? extraVisualisationSections.map(
                          (ExtraVisualisationSection, idx) => (
                              <ExtraVisualisationSection
                                  key={idx}
                                  dataset={this.props.dataset}
                              />
                          )
                      )
                    : null}
            </div>
        );
    }
}

DatasetPagePreview.propTypes = {
    dataset: PropTypes.object
};
