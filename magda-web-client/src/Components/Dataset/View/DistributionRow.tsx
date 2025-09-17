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
import CommonLink from "Components/Common/CommonLink";
import { getFormatIcon, determineFormatIcon } from "./DistributionIcon";
import { licenseLevel } from "constants/DatasetConstants";
import getStorageApiResourceAccessUrl from "helpers/getStorageApiResourceAccessUrl";
import humanFileSize from "helpers/humanFileSize";
import { getUrlWithPopUpQueryString } from "helpers/popupUtils";

export type PropType = {
    dataset: Dataset;
    distribution: ParsedDistribution;
    searchText: string;
};

class DistributionRow extends Component<PropType> {
    state = {
        isExpanded: false
    };

    /**
     * Replace underscores in links with spaces
     * This stops the text from going off the edge of the screen
     */
    renderDistributionLink = (title) => {
        if (title.includes("_")) {
            return title.replace(/_/g, " ");
        } else {
            return title;
        }
    };

    render() {
        const { dataset, distribution } = this.props;
        const runtimeDownloadUrl = distribution.downloadURL
            ? getStorageApiResourceAccessUrl(distribution.downloadURL)
            : undefined;

        const distributionLink = getUrlWithPopUpQueryString(
            `/dataset/${encodeURIComponent(
                dataset.identifier
            )}/distribution/${encodeURIComponent(
                distribution.identifier!
            )}/?q=${this.props.searchText}`
        );

        let apiUrl = "";

        if (
            distribution.ckanResource &&
            distribution.ckanResource.datastore_active
        ) {
            apiUrl = get(distribution, "sourceDetails.url")
                ? get(distribution, "sourceDetails.url", "").replace(
                      "3/action/resource_show?",
                      "1/util/snippet/api_info.html?resource_"
                  )
                : "https://docs.ckan.org/en/latest/maintaining/datastore.html#the-datastore-api";
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
                                <Link
                                    to={distributionLink}
                                    itemProp="contentUrl"
                                >
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
                                {distribution.accessURL && (
                                    <CommonLink
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        href={distribution.accessURL}
                                        className="new-tab-button"
                                    >
                                        <img src={newTabIcon} alt="new tab" />
                                    </CommonLink>
                                )}
                            </div>

                            <div
                                className="distribution-row-link-license"
                                itemProp="license"
                            >
                                {typeof distribution?.byteSize === "number"
                                    ? `${humanFileSize(
                                          distribution.byteSize
                                      )} | `
                                    : null}
                                {(distribution.license &&
                                    licenseLevel[distribution.license]) ||
                                    distribution.license}
                            </div>
                        </div>
                    </div>
                </div>
                <div className="col-sm-4 button-area">
                    {apiUrl && (
                        <span>
                            <span className="no-print">
                                <CommonLink
                                    className="download-button au-btn au-btn--secondary au-float-left"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    href={apiUrl}
                                >
                                    <img src={apiAccessIcon} alt="" /> Access
                                    Data API
                                </CommonLink>
                            </span>
                            <span className="block print-only">
                                API: {apiUrl}
                            </span>
                        </span>
                    )}{" "}
                    {distribution.downloadURL && (
                        <span>
                            <span className="no-print">
                                <CommonLink
                                    className="download-button au-btn au-btn--secondary"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    href={runtimeDownloadUrl}
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
                                                category:
                                                    "Download by Publisher",
                                                action:
                                                    dataset?.publisher?.name,
                                                label: resource_url
                                            });
                                        }
                                    }}
                                >
                                    <img src={downloadIcon} alt="download" />{" "}
                                    Download
                                </CommonLink>
                            </span>
                            <span className="block print-only">
                                Download: {runtimeDownloadUrl}
                            </span>
                        </span>
                    )}
                </div>
            </div>
        );
    }
}

export default connect()(DistributionRow);
