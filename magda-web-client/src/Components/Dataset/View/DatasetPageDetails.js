import React, { Component } from "react";
import DatasetPagePreview from "./DatasetPagePreview";
import MarkdownViewer from "Components/Common/MarkdownViewer";
import { connect } from "react-redux";
import DistributionRow from "./DistributionRow";
import queryString from "query-string";
import defined from "helpers/defined";
import CommonLink from "Components/Common/CommonLink";
import DiscourseComments from "Components/Dataset/View/DiscourseComments";
import { config } from "../../../config";
import "./DatasetDetails.scss";
import "./DatasetPageDetails.scss";

class DatasetPageDetails extends Component {
    state = {
        showPreview: false
    };
    render() {
        const dataset = this.props.dataset;
        const searchText =
            queryString.parse(this.props.location.search).q || "";
        const sourceName = this.props?.dataset?.sourceDetails?.originalName
            ? this.props.dataset.sourceDetails.originalName
            : this.props.dataset?.sourceDetails?.name;
        const source = sourceName
            ? `This dataset was originally found on ${
                  dataset.landingPage
                      ? `[${sourceName}](${dataset.landingPage})`
                      : sourceName
              } "${dataset.title}".${
                  dataset.landingPage
                      ? "\nPlease visit the source to access the original metadata of the dataset:"
                      : ""
              }`
            : "";
        return (
            <div className="dataset-details">
                <div className="dataset-preview">
                    <DatasetPagePreview
                        location={this.props.location}
                        dataset={dataset}
                    />
                </div>

                <div className="row">
                    <div className="col-sm-12">
                        <div className="dataset-details-files-apis">
                            <h3 className="clearfix section-heading">
                                <span className="section-heading">
                                    Files and APIs
                                </span>
                            </h3>
                            <div className="clearfix">
                                {dataset.distributions.map((s) => (
                                    <DistributionRow
                                        key={s.identifier}
                                        distribution={s}
                                        dataset={dataset}
                                        searchText={searchText}
                                    />
                                ))}
                            </div>
                        </div>
                        {(source || dataset.provenance) && (
                            <div className="dataset-details-source">
                                <h3 className="section-heading">Data Source</h3>
                                {source && (
                                    <MarkdownViewer
                                        markdown={source}
                                        truncate={false}
                                    />
                                )}
                                {dataset?.landingPage ? (
                                    <CommonLink
                                        className="landing-page"
                                        href={dataset.landingPage}
                                    >
                                        {dataset.landingPage}
                                    </CommonLink>
                                ) : null}

                                {defined(dataset.provenance) &&
                                defined(dataset.provenance.isOpenData) ? (
                                    <h3 className="section-heading">
                                        Type:{" "}
                                        {dataset.provenance.isOpenData
                                            ? "Public"
                                            : "Private"}
                                    </h3>
                                ) : null}
                            </div>
                        )}
                    </div>
                </div>

                {config.discourseSiteUrl &&
                config.discourseIntegrationDatasetPage ? (
                    <div className="row">
                        <div className="col-sm-12">
                            <DiscourseComments
                                title={
                                    dataset?.title
                                        ? dataset.title
                                        : "Untitlted Dataset"
                                }
                                datasetId={dataset.identifier}
                            />
                        </div>
                    </div>
                ) : null}
            </div>
        );
    }
}

function mapStateToProps(state) {
    const record = state.record;
    const dataset = record.dataset;
    return {
        dataset
    };
}

export default connect(mapStateToProps)(DatasetPageDetails);
