import React, { Component } from "react";
import DatasetPagePreview from "./DatasetPagePreview";
import MarkdownViewer from "Components/Common/MarkdownViewer";
import { connect } from "react-redux";
import DistributionRow from "./DistributionRow";
import queryString from "query-string";
import defined from "helpers/defined";
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
                                <a
                                    className="landing-page"
                                    href={dataset.landingPage}
                                >
                                    {dataset.landingPage}
                                </a>
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
