import React, { FunctionComponent } from "react";
import AUpageAlert from "pancake/react/page-alerts";
import { Link, Route, Switch, Redirect, withRouter } from "react-router-dom";
import Breadcrumbs from "Components/Common/Breadcrumbs";
import defined from "helpers/defined";
import { gapi } from "analytics/ga";
import DistributionDetails from "./View/DistributionDetails";
import { Small, Medium } from "Components/Common/Responsive";
import DescriptionBox from "Components/Common/DescriptionBox";
import { getFormatIcon } from "./View/DistributionIcon";
import apiAccessIcon from "assets/apiAccess.svg";
import downloadWhiteIcon from "assets/download-white.svg";
import CommonLink from "Components/Common/CommonLink";
import { History, Location } from "history";
import {
    ParsedDataset,
    ParsedDistribution,
    parseDistribution,
    RawDistribution
} from "helpers/record";
import { licenseLevel } from "constants/DatasetConstants";
import { useAsync } from "react-async-hook";
import urijs from "urijs";
import {
    VersionAspectData,
    fetchHistoricalRecord
} from "api-clients/RegistryApis";
import RecordVersionList from "./RecordVersionList";
import getStorageApiResourceAccessUrl from "helpers/getStorageApiResourceAccessUrl";
import "./DatasetPage.scss";

interface PropsType {
    history: History;
    datasetId: string;
    distributionId: string;
    dataset: ParsedDataset;
    distribution: ParsedDistribution;
    breadcrumbs: JSX.Element | null;
    searchText: string;
    location: Location;
}

const getVersionFromLocation = (location: Location): number | undefined => {
    const queries = urijs(location.search).search(true);
    try {
        const version = parseInt(queries?.version as string);
        if (isNaN(version)) {
            return undefined;
        } else {
            return version;
        }
    } catch (e) {
        return undefined;
    }
};

const DistributionPageMainContent: FunctionComponent<{
    distribution: ParsedDistribution;
    datasetId: string;
    distributionId: string;
    dataset: ParsedDataset;
    searchText: string;
    versionData?: VersionAspectData;
    selectedVersion?: number;
}> = (props) => {
    const { distribution, dataset } = props;

    const baseUrlDistribution = `/dataset/${encodeURI(
        props.datasetId
    )}/distribution/${encodeURI(props.distributionId)}`;

    const publisherId = dataset?.publisher?.id ? dataset.publisher.id : null;

    return (
        <>
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
            <div className="distribution-format">{distribution.format}</div>
            {defined(distribution.license) && (
                <span className="distribution-license">
                    <span className="separator hidden-sm">&nbsp;/&nbsp;</span>
                    {licenseLevel[distribution.license] || distribution.license}
                </span>
            )}
            <br />
            {distribution.downloadURL ? (
                <CommonLink
                    className="au-btn au-btn--primary distribution-download-button"
                    href={getStorageApiResourceAccessUrl(
                        distribution.downloadURL
                    )}
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
                </CommonLink>
            ) : null}{" "}
            {distribution.ckanResource &&
                distribution.ckanResource.datastore_active && (
                    <CommonLink
                        className="download-button au-btn au-btn--secondary"
                        target="_blank"
                        rel="noopener noreferrer"
                        href={
                            typeof distribution?.sourceDetails?.url === "string"
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
                    </CommonLink>
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
                        render={() => (
                            <DistributionDetails
                                distribution={distribution}
                                dataset={dataset}
                            />
                        )}
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
            <div className="version-list-section">
                <RecordVersionList
                    versionData={props.versionData}
                    selectedVersion={props.selectedVersion}
                    recordPageBaseUrl={`/dataset/${props.datasetId}/distribution/${props.distributionId}/details`}
                    retainQueryParameterNames={["q"]}
                />
            </div>
        </>
    );
};

const DistributionPage: FunctionComponent<PropsType> = (props) => {
    const { distribution: currentDistribution, breadcrumbs, location } = props;
    const { identifier, version: versionData } = currentDistribution;
    const requestVersion = getVersionFromLocation(location);

    const {
        result: distribution,
        loading: isDistributionLoading,
        error: distributionLoadingError
    } = useAsync(
        async (
            identifier: string | undefined,
            requestVersion: number | undefined,
            currentDistribution: ParsedDistribution,
            versionData?: VersionAspectData
        ) => {
            if (typeof requestVersion === "undefined" || !currentDistribution) {
                return currentDistribution;
            }

            if (!versionData?.versions?.length) {
                throw new Error(
                    `Cannot locate the version \`${requestVersion}\` required for the distribution record.`
                );
            }

            const selectedVersion = versionData.versions.find(
                (v) => v.versionNumber === requestVersion
            );

            if (!selectedVersion) {
                throw new Error(
                    `Cannot locate the version \`${requestVersion}\` required for the distribution record.`
                );
            }

            if (!selectedVersion?.eventId) {
                throw new Error(
                    `the required version \`${requestVersion}\` does not contain an eventId that is required to retrieve a historical copy of a record.`
                );
            }

            const distributionData = await fetchHistoricalRecord<
                RawDistribution
            >(identifier as string, selectedVersion.eventId);

            return parseDistribution(distributionData);
        },
        [identifier, requestVersion, currentDistribution, versionData]
    );

    return (
        <div className="record--distribution">
            <Medium>
                <Breadcrumbs breadcrumbs={breadcrumbs} />
            </Medium>
            <div className="row">
                <div className="col-sm-12">
                    {(() => {
                        if (isDistributionLoading || !distribution) {
                            return <p>Loading distribution datat...</p>;
                        } else if (distributionLoadingError) {
                            return (
                                <AUpageAlert as="error">
                                    <h3>Failed to load distribution data</h3>
                                    <p>{`${distributionLoadingError}`}</p>
                                </AUpageAlert>
                            );
                        } else {
                            return (
                                <DistributionPageMainContent
                                    distribution={distribution}
                                    datasetId={props.datasetId}
                                    distributionId={props.distributionId}
                                    dataset={props.dataset}
                                    searchText={props.searchText}
                                    versionData={versionData}
                                    selectedVersion={
                                        requestVersion === null
                                            ? undefined
                                            : requestVersion
                                    }
                                />
                            );
                        }
                    })()}
                </div>
            </div>
        </div>
    );
};

export default withRouter(DistributionPage);
