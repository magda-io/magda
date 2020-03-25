import React, { FunctionComponent } from "react";
import { Link, Route, Switch, Redirect, withRouter } from "react-router-dom";
import Breadcrumbs from "Components/Common/Breadcrumbs";
import defined from "helpers/defined";
import { gapi } from "analytics/ga";
import DistributionDetails from "./View/DistributionDetails";
import DistributionPreview from "./View/DistributionPreview";
import { Small, Medium } from "Components/Common/Responsive";
import DescriptionBox from "Components/Common/DescriptionBox";
import "./DatasetPage.scss";
import { getFormatIcon } from "./View/DistributionIcon";
import apiAccessIcon from "assets/apiAccess.svg";
import downloadWhiteIcon from "assets/download-white.svg";

import { History } from "history";
import { ParsedDataset, ParsedDistribution } from "helpers/record";

interface PropsType {
    history: History;
    datasetId: string;
    distributionId: string;
    dataset: ParsedDataset;
    distribution: ParsedDistribution;
    breadcrumbs: JSX.Element | null;
    searchText: string;
}

const DistributionPage: FunctionComponent<PropsType> = props => {
    const { dataset, distribution, breadcrumbs } = props;

    const baseUrlDistribution = `/dataset/${encodeURI(
        props.datasetId
    )}/distribution/${encodeURI(props.distributionId)}`;

    const publisherId = dataset?.publisher?.id ? dataset.publisher.id : null;

    return (
        <div className="record--distribution">
            <Medium>
                <Breadcrumbs breadcrumbs={breadcrumbs} />
            </Medium>
            <div className="row">
                <div className="col-sm-12">
                    <span className="distribution-title">
                        <img
                            className="distribution-icon"
                            src={getFormatIcon(distribution)}
                            alt="distribution icon"
                        />

                        <h1>{distribution.title}</h1>
                    </span>
                    <div className="distribution-meta">
                        <div className="publisher">
                            <Link to={`/organisations/${publisherId}`}>
                                {dataset.publisher.name}
                            </Link>
                        </div>

                        {distribution?.updatedDate && (
                            <span className="updated-date">
                                <span className="separator hidden-sm">
                                    &nbsp;/&nbsp;
                                </span>
                                Updated {distribution.updatedDate}
                            </span>
                        )}

                        {defined(dataset.issuedDate) && (
                            <span className="created-date">
                                <span className="separator hidden-sm">
                                    &nbsp;/&nbsp;
                                </span>
                                Created {dataset.issuedDate}
                            </span>
                        )}
                    </div>
                    <div className="distribution-format">
                        {distribution.format}
                    </div>
                    {defined(distribution.license) && (
                        <span className="distribution-license">
                            <span className="separator hidden-sm">
                                &nbsp;/&nbsp;
                            </span>
                            {distribution.license}
                        </span>
                    )}
                    <br />
                    {distribution.downloadURL ? (
                        <a
                            className="au-btn au-btn--primary distribution-download-button"
                            href={distribution.downloadURL}
                            onClick={() => {
                                // google analytics download tracking
                                const resource_url = encodeURIComponent(
                                    distribution.downloadURL as string
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
                            <span
                                style={{
                                    textDecoration: "none !important"
                                }}
                            >
                                <img
                                    src={downloadWhiteIcon}
                                    alt="download"
                                    className="distribution-button-icon"
                                />
                                {"  "}
                            </span>
                            Download
                        </a>
                    ) : null}{" "}
                    {distribution.ckanResource &&
                        distribution.ckanResource.datastore_active && (
                            <a
                                className="download-button au-btn au-btn--secondary"
                                target="_blank"
                                rel="noopener noreferrer"
                                href={
                                    typeof distribution?.sourceDetails?.url ===
                                    "string"
                                        ? distribution.sourceDetails.url.replace(
                                              "3/action/resource_show?",
                                              "1/util/snippet/api_info.html?resource_"
                                          )
                                        : "https://docs.ckan.org/en/latest/maintaining/datastore.html#the-datastore-api"
                                }
                            >
                                <img
                                    src={apiAccessIcon}
                                    alt=""
                                    className="distribution-button-icon"
                                />{" "}
                                Access Data API
                            </a>
                        )}{" "}
                    <Small>
                        <DescriptionBox
                            content={distribution.description}
                            truncateLength={200}
                        />
                    </Small>
                    <Medium>
                        <DescriptionBox
                            content={distribution.description}
                            truncateLength={500}
                        />
                    </Medium>
                    <div className="tab-content">
                        <Switch>
                            <Route
                                path="/dataset/:datasetId/distribution/:distributionId/details"
                                component={DistributionDetails}
                            />
                            <Route
                                path="/dataset/:datasetId/distribution/:distributionId/preview"
                                component={DistributionPreview}
                            />
                            <Redirect
                                from="/dataset/:datasetId/distribution/:distributionId"
                                to={{
                                    pathname: `${baseUrlDistribution}/details`,
                                    search: `?q=${props.searchText}`
                                }}
                            />
                        </Switch>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default withRouter(DistributionPage);
