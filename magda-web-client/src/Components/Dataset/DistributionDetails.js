import React, { Component } from "react";
import { connect } from "react-redux";
import DataPreviewVis from "../../UI/DataPreviewVis";
import MagdaNamespacesConsumer from "../../Components/i18n/MagdaNamespacesConsumer";

import { gapi } from "../../analytics/ga";

import "./RecordDetails.css";

class DistributionDetails extends Component {
    renderLinkStatus(linkStatusAvailable, linkActive) {
        if (linkStatusAvailable && !linkActive) {
            return "(This link appears to be broken)";
        }
        return "";
    }

    renderLinkText(distribution) {
        const downloadText = distribution.downloadURL && (
            <div key={distribution.identifier}>
                This data file or API can be downloaded from: <br />
                <a
                    className="url"
                    onClick={distribution => {
                        // google analytics download tracking
                        const resource_url = encodeURIComponent(
                            distribution.downloadURL
                        );
                        if (resource_url) {
                            gapi.event({
                                category: "Resource",
                                action: "Download",
                                label: resource_url
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
            </div>
        );
        const accessText = distribution.accessURL && (
            <div>
                This dataset can be accessed from: <br />{" "}
                <a className="url" href={distribution.accessURL}>
                    {distribution.accessURL}
                </a>
            </div>
        );

        return [downloadText, accessText].filter(x => !!x);
    }

    render() {
        const distribution = this.props.distribution;
        const sourceText = this.renderLinkText(distribution);
        return (
            <MagdaNamespacesConsumer ns={["distributionPage"]}>
                {translate => {
                    const accessNotesPrefix = translate([
                        "accessNotesPrefix",
                        ""
                    ]);
                    const accessNotesSuffix = translate([
                        "accessNotesSuffix",
                        ""
                    ]);

                    return (
                        <div className="distribution-details">
                            <div className="row">
                                <div className="distribution-details__body col-sm-8">
                                    {sourceText.length > 0 && (
                                        <div>
                                            {" "}
                                            <h3>Source</h3>
                                            {sourceText}
                                        </div>
                                    )}
                                    {distribution.accessNotes && (
                                        <div>
                                            <h3>Access Notes</h3>
                                            {accessNotesPrefix && (
                                                <div>{accessNotesPrefix}</div>
                                            )}
                                            <div>
                                                {distribution.accessNotes}
                                            </div>
                                            {accessNotesSuffix && (
                                                <div>{accessNotesSuffix}</div>
                                            )}
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
                }}
            </MagdaNamespacesConsumer>
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
