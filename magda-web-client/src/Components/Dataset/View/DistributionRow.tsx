import React, { Component } from "react";
import { connect } from "react-redux";
import { ParsedDistribution } from "helpers/record";
import { Link } from "react-router-dom";
import { get } from "lodash";
import "./DistributionRow.scss";
import downloadIcon from "assets/download.svg";
import apiAccessIcon from "assets/apiAccess.svg";
import newTabIcon from "assets/external.svg";
import { Medium } from "Components/Common/Responsive";
import { gapi } from "analytics/ga";
import { Dataset } from "helpers/datasetSearch";

import { getFormatIcon, determineFormatIcon } from "./DistributionIcon";

export type PropType = {
    dataset: Dataset;
    distribution: ParsedDistribution;
    searchText: string;
};

class DistributionRow extends Component<PropType> {
    state = {
        isExpanded: false
    };

    constructor(props: PropType) {
        super(props);
    }

    /**
     * Replace underscores in links with spaces
     * This stops the text from going off the edge of the screen
     */
    renderDistributionLink = title => {
        if (title.includes("_")) {
            return title.replace(/_/g, " ");
        } else {
            return title;
        }
    };

    render() {
        const { dataset, distribution } = this.props;
        let distributionLink;
        if (!distribution.downloadURL && distribution.accessURL) {
            distributionLink = distribution.accessURL;
        } else {
            distributionLink = `/dataset/${encodeURIComponent(
                dataset.identifier
            )}/distribution/${encodeURIComponent(
                distribution.identifier!
            )}/?q=${this.props.searchText}`;
        }

        return (
            <div
                className="distribution-row row"
                itemProp="distribution"
                itemScope
                itemType="http://schema.org/DataDownload"
            >
                <div className="col-sm-8">
                    <div className="row">
                        <Medium>
                            <div className="col-sm-1">
                                <img
                                    className="format-icon"
                                    src={getFormatIcon(distribution)}
                                    alt="format icon"
                                    data-tip={determineFormatIcon(distribution)}
                                    data-place="top"
                                />
                            </div>
                        </Medium>

                        <div className="col-sm-11">
                            <div className="distribution-row-link">
                                {!distribution.downloadURL &&
                                distribution.accessURL ? (
                                    <div>
                                        <span itemProp="name">
                                            {this.renderDistributionLink(
                                                distribution.title
                                            )}
                                        </span>
                                        (
                                        <span itemProp="fileFormat">
                                            {distribution.format}
                                        </span>
                                        )
                                    </div>
                                ) : (
                                    <Link to={distributionLink}>
                                        <span itemProp="name">
                                            {this.renderDistributionLink(
                                                distribution.title
                                            )}
                                        </span>
                                        (
                                        <span itemProp="fileFormat">
                                            {distribution.format}
                                        </span>
                                        )
                                    </Link>
                                )}
                                <a
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    href={distributionLink}
                                    className="new-tab-button"
                                >
                                    <img src={newTabIcon} alt="new tab" />
                                </a>
                            </div>

                            <div
                                className="distribution-row-link-license"
                                itemProp="license"
                            >
                                {distribution.license &&
                                    (typeof distribution.license === "string"
                                        ? distribution.license
                                        : distribution.license.name
                                        ? distribution.license.name
                                        : "")}
                            </div>
                        </div>
                    </div>
                </div>
                <div className="col-sm-4 button-area no-print">
                    {distribution.ckanResource &&
                        distribution.ckanResource.datastore_active && (
                            <a
                                className="download-button au-btn au-btn--secondary au-float-left"
                                target="_blank"
                                rel="noopener noreferrer"
                                href={
                                    get(distribution, "sourceDetails.url")
                                        ? get(
                                              distribution,
                                              "sourceDetails.url",
                                              ""
                                          ).replace(
                                              "3/action/resource_show?",
                                              "1/util/snippet/api_info.html?resource_"
                                          )
                                        : "https://docs.ckan.org/en/latest/maintaining/datastore.html#the-datastore-api"
                                }
                            >
                                <img src={apiAccessIcon} alt="" /> Access Data
                                API
                            </a>
                        )}{" "}
                    {distribution.downloadURL && (
                        <a
                            className="download-button au-btn au-btn--secondary"
                            target="_blank"
                            rel="noopener noreferrer"
                            href={distribution.downloadURL}
                            onClick={() => {
                                // google analytics download tracking
                                const resource_url = encodeURIComponent(
                                    distribution.downloadURL!
                                );
                                if (resource_url) {
                                    // legacy support
                                    gapi.event({
                                        category: "Resource",
                                        action: "Download",
                                        label: resource_url
                                    });
                                    // new events
                                    gapi.event({
                                        category: "Download by Dataset",
                                        action: dataset.title,
                                        label: resource_url
                                    });
                                    gapi.event({
                                        category: "Download by Source",
                                        action: dataset.source,
                                        label: resource_url
                                    });
                                    gapi.event({
                                        category: "Download by Publisher",
                                        action: dataset.publisher.name,
                                        label: resource_url
                                    });
                                }
                            }}
                        >
                            <img src={downloadIcon} alt="download" /> Download
                        </a>
                    )}
                </div>
            </div>
        );
    }
}

export default connect()(DistributionRow);
