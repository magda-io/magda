import React, { Component } from "react";
import { Location } from "history";
import DataPreviewVis, {
    mergeDatasetAndDistributionPreviewSettings
} from "Components/Common/DataPreviewVis";
import DataPreviewMap from "Components/Common/DataPreviewMap";
import { getPluginExtraVisualisationSections } from "../../../externalPluginComponents";
import { ParsedDistribution, ParsedDataset } from "../../../helpers/record";
import "./DatasetPagePreview.scss";

const extraVisualisationSections = getPluginExtraVisualisationSections();

interface PropsTypes {
    dataset: ParsedDataset;
    location: Location;
}

export default class DatasetPagePreview extends Component<PropsTypes> {
    getDistributionForVis(
        distributions: ParsedDistribution[],
        dataset: ParsedDataset
    ) {
        if (!distributions || distributions?.length === 0) {
            return null;
        }
        const dist = distributions.find((d) => {
            // Checking if the distribution has a url
            if (!(typeof d === "string") && !d.downloadURL && !d.accessURL) {
                return null;
            }
            return /(^|\W+)csv(\W+|$)/i.test(d.format);
        });

        if (!dist) {
            return null;
        }

        return mergeDatasetAndDistributionPreviewSettings(dist, dataset);
    }

    render() {
        const distributions = this.props.dataset.distributions;
        const dataset = this.props.dataset;
        return (
            <div className="dataset-preview">
                <DataPreviewVis
                    dataset={dataset}
                    distribution={this.getDistributionForVis(
                        distributions,
                        this.props.dataset
                    )}
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
