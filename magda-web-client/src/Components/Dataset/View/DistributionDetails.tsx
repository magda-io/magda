import React, { Component } from "react";
import DataPreviewVis from "Components/Common/DataPreviewVis";
import MagdaNamespacesConsumer from "Components/i18n/MagdaNamespacesConsumer";
import ContactPoint from "Components/Common/ContactPoint";
import CommonLink from "Components/Common/CommonLink";
import { gapi } from "analytics/ga";
import { ParsedDataset, ParsedDistribution } from "helpers/record";
import getStorageApiResourceAccessUrl from "helpers/getStorageApiResourceAccessUrl";
import "./DatasetDetails.scss";

class DistributionDetails extends Component<{
    dataset: ParsedDataset;
    distribution: ParsedDistribution;
}> {
    renderLinkStatus(linkStatusAvailable, linkActive) {
        if (linkStatusAvailable && !linkActive) {
            return "(This link appears to be broken)";
        }
        return "";
    }

    renderLinkText(distribution) {
        const runtimeDownloadUrl = getStorageApiResourceAccessUrl(
            distribution.downloadURL
        );
        const downloadText = distribution.downloadURL && (
            <div key={distribution.identifier}>
                This data file or API can be downloaded from: <br />
                <CommonLink
                    className="url"
                    onClick={(distribution) => {
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
                    href={runtimeDownloadUrl}
                >
                    {" "}
                    {runtimeDownloadUrl}
                </CommonLink>
                {this.renderLinkStatus(
                    distribution.linkStatusAvailable,
                    distribution.linkActive
                )}
            </div>
        );
        const accessText = distribution.accessURL && (
            <div>
                This dataset can be accessed from: <br />{" "}
                <CommonLink className="url" href={distribution.accessURL}>
                    {distribution.accessURL}
                </CommonLink>
            </div>
        );

        const accessNotes = distribution.accessNotes && (
            <MagdaNamespacesConsumer ns={["datasetPage"]}>
                {(translate) => {
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
            (x) => !!x
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
                            distribution={this.props.distribution}
                        />{" "}
                    </div>
                )}
            </div>
        );
    }
}

export default DistributionDetails;
