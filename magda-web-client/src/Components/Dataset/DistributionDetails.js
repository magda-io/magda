import React, { Component } from "react";
import { connect } from "react-redux";
import DataPreviewVis from "../../UI/DataPreviewVis";
import MagdaNamespacesConsumer from "../../Components/i18n/MagdaNamespacesConsumer";
import ContactPoint from "../../UI/ContactPoint";

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

        const accessNotes = distribution.accessNotes && (
            <MagdaNamespacesConsumer ns={["datasetPage"]}>
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
                        <React.Fragment>
                            <div className="heading">Access Notes: </div>
                            <div className="access-notes">
                                {accessNotesPrefix &&
                                    accessNotesPrefix.length && (
                                        <p>{accessNotesPrefix}</p>
                                    )}
                                <p>{distribution.accessNotes}</p>
                                {accessNotesSuffix &&
                                    accessNotesSuffix.length && (
                                        <p>{accessNotesSuffix}</p>
                                    )}
                            </div>
                        </React.Fragment>
                    );
                }}
            </MagdaNamespacesConsumer>
        );

        const contactPoint = this.props.dataset.contactPoint && (
            <ContactPoint contactPoint={this.props.dataset.contactPoint} />
        );

        return [downloadText, accessText, accessNotes, contactPoint].filter(
            x => !!x
        );
    }

    render() {
        const distribution = this.props.distribution;
        const sourceText = this.renderLinkText(distribution);

        return (
            <div className="distribution-details">
                <div className="row">
                    <div className="distribution-details__body col-sm-8">
                        {sourceText.length > 0 && (
                            <div>
                                {" "}
                                <h3 className="section-heading">Source</h3>
                                {sourceText}
                            </div>
                        )}
                    </div>
                </div>

                {distribution.downloadURL && (
                    <div className="distribution-preview">
                        <DataPreviewVis
                            location={this.props.location}
                            dataset={this.props.dataset}
                            distribution={this.props.distribution}
                        />{" "}
                    </div>
                )}
            </div>
        );
    }
}

function mapStateToProps(state) {
    const distribution = state.record.distribution;
    const dataset = state.record.dataset;
    return {
        distribution,
        dataset
    };
}

export default connect(mapStateToProps)(DistributionDetails);
