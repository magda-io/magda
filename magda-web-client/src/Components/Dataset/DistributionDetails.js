import React, { Component } from "react";
import { connect } from "react-redux";
import DataPreviewVis from "../../UI/DataPreviewVis";

import ga from "../../analytics/googleAnalytics";
import "./RecordDetails.css";

class DistributionDetails extends Component {
    renderLinkStatus(linkStatusAvailable, linkActive) {
        if (linkStatusAvailable && !linkActive) {
            return "(This link appears to be broken)";
        }
        return "";
    }

    renderLinkText(distribution) {
        const downloadText =
            distribution.downloadURL && distribution.linkActive ? (
                <span key={distribution.identifier}>
                    This data file or API can be downloaded from: <br />
                    <a
                        onClick={distribution => {
                            // google analytics download tracking
                            const resource_url = encodeURIComponent(
                                distribution.downloadURL
                            );
                            if (resource_url) {
                                ga("send", {
                                    hitType: "event",
                                    eventCategory: "Resource",
                                    eventAction: "Download",
                                    eventLabel: resource_url
                                });
                            }
                        }}
                        href={distribution.downloadURL}
                    >
                        {" "}
                        {distribution.downloadURL}
                    </a>
                    {this.renderLinkStatus(
                        distribution.linkStatusAvailable,
                        distribution.linkActive
                    )}
                </span>
            ) : (
                ""
            );
        const accessText = distribution.accessURL ? (
            <span>
                This dataset can be accessed from: <br />{" "}
                <a href={distribution.accessURL}>{distribution.accessURL}</a>
            </span>
        ) : (
            ""
        );
        const items = [];
        if (downloadText) items.push(downloadText);
        if (accessText) items.push(accessText);
        return items;
    }

    render() {
        const distribution = this.props.distribution;
        return (
            <div className="distribution-details">
                <div className="row">
                    <div className="distribution-details__body col-sm-8">
                        {this.renderLinkText(distribution).length > 0 && (
                            <div>
                                {" "}
                                <h3>Source</h3>
                                {this.renderLinkText(distribution)}
                            </div>
                        )}
                    </div>
                </div>
                <div className="distribution-preview">
                    <DataPreviewVis
                        location={this.props.location}
                        dataset={this.props.dataset}
                        distribution={this.props.distribution}
                    />{" "}
                </div>
            </div>
        );
    }
}

function mapStateToProps(state) {
    const distribution = state.record.distribution;
    return {
        distribution
    };
}

export default connect(mapStateToProps)(DistributionDetails);
