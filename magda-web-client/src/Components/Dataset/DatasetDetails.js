import React, { Component } from "react";
import TemporalAspectViewer from "../../UI/TemporalAspectViewer";
import DatasetPreview from "./DatasetPreview";
import MarkdownViewer from "../../UI/MarkdownViewer";
import { connect } from "react-redux";
import DistributionRow from "../DistributionRow";
import queryString from "query-string";
import defined from "../../helpers/defined";
import "./RecordDetails.css";
import "./DatasetDetails.css";

class DatasetDetails extends Component {
    state = {
        showPreview: false
    };
    render() {
        const dataset = this.props.dataset;
        const searchText =
            queryString.parse(this.props.location.search).q || "";
        const source = this.props.dataset.source
            ? `This dataset was originally found on ${
                  dataset.landingPage
                      ? `[${this.props.dataset.source}](${dataset.landingPage})`
                      : this.props.dataset.source
              }`
            : "";
        return (
            <div className="dataset-details">
                <div className="dataset-preview">
                    <DatasetPreview
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
                                {dataset.distributions.map(s => (
                                    <DistributionRow
                                        key={s.identifier}
                                        distribution={s}
                                        dataset={dataset}
                                        searchText={searchText}
                                    />
                                ))}
                            </div>
                        </div>
                        {source && (
                            <div className="dataset-details-source">
                                <h3 className="section-heading">Data Source</h3>
                                <MarkdownViewer
                                    markdown={source}
                                    truncate={false}
                                />
                                <a
                                    className="landing-page"
                                    href={dataset.landingPage}
                                >
                                    {dataset.landingPage}
                                </a>
                                {defined(dataset.creation) &&
                                defined(dataset.creation.isOpenData) ? (
                                    <h3 className="section-heading">
                                        Type:{" "}
                                        {dataset.creation.isOpenData
                                            ? "Public"
                                            : "Private"}
                                    </h3>
                                ) : null}
                            </div>
                        )}
                        <div
                            className="dataset-details-temporal-coverage"
                            style={{ display: "none" }}
                        >
                            <h3 className="section-heading">
                                Temporal coverage
                            </h3>
                            <TemporalAspectViewer
                                data={dataset.temporalCoverage}
                            />
                        </div>
                    </div>
                </div>
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

export default connect(mapStateToProps)(DatasetDetails);
