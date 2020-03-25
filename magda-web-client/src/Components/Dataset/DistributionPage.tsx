import React from "react";
import { connect } from "react-redux";
import {
    Link,
    Route,
    Switch,
    Redirect,
    withRouter,
    match
} from "react-router-dom";
import ProgressBar from "Components/Common/ProgressBar";
import MagdaDocumentTitle from "Components/i18n/MagdaDocumentTitle";
import Breadcrumbs from "Components/Common/Breadcrumbs";
import { bindActionCreators } from "redux";
import {
    fetchDatasetFromRegistry,
    fetchDistributionFromRegistry,
    resetFetchRecord
} from "actions/recordActions";
import defined from "helpers/defined";
import { gapi } from "analytics/ga";
import ErrorHandler from "Components/Error/ErrorHandler";
import RouteNotFound from "Components/Error/RouteNotFoundPage";
import DistributionDetails from "./View/DistributionDetails";
import DistributionPreview from "./View/DistributionPreview";
import queryString from "query-string";
import { Small, Medium } from "Components/Common/Responsive";
import DescriptionBox from "Components/Common/DescriptionBox";
import "./DatasetPage.scss";
import { getFormatIcon } from "./View/DistributionIcon";
import apiAccessIcon from "assets/apiAccess.svg";
import downloadWhiteIcon from "assets/download-white.svg";
import { get } from "lodash";

import { config } from "config";
import { History, Location } from "history";
import { ParsedDataset, ParsedDistribution } from "helpers/record";
import { FetchError } from "types";

interface PropsType {
    history: History;
    location: Location;
    match: match<{
        datasetId?: string;
        distributionId?: string;
    }>;
    dataset: ParsedDataset;
    distribution: ParsedDistribution;
    datasetIsFetching: boolean;
    distributionIsFetching: boolean;
    datasetFetchError?: FetchError;
    distributionFetchError?: FetchError;
    hasEditPermissions: boolean;
    resetFetchRecord: Function;
    modifyRecordAspect: Function;
}

interface StateType {
    addMargin: boolean;
}

class DistributionPage extends React.Component<PropsType, StateType> {
    constructor(props) {
        super(props);
        this.state = {
            addMargin: false
        };
        this.getBreadcrumbs = this.getBreadcrumbs.bind(this);
    }

    toggleMargin = addMargin => {
        this.setState({ addMargin });
    };

    componentDidMount() {
        // check if we are on distribution page:
        if (this.props.match.params.distributionId) {
            this.fetchDistribution(this.props);
            // we also need to fetch dataset here, if we donot already have the correct dataset
            this.fetchDataset(this.props);
        }
        // if we are on dataset page, check if dataset has already been fetched and if it's the correct one
        else if (this.props.match.params.datasetId) {
            this.fetchDataset(this.props);
        }

        this.updateGAEvent(this.props);
    }

    componentDidUpdate() {
        const props = this.props;
        // fetch if
        // 1. on dataset page, no dataset has been fetched or the cached dataset is not the one we are looking for
        // 2. on distribution page and no distribution has been fetched or the cached distribution is not the one we are looking for

        // check if we are on distribution page:
        if (props.match.params.distributionId) {
            this.fetchDistribution(props);
            // we also need to fetch dataset here, if we donot already have the correct dataset
            this.fetchDataset(props);
        }
        // if we are on dataset page, check if dataset has already been fetched and if it's the correct one
        else if (props.match.params.datasetId) {
            this.fetchDataset(props);
        }

        this.updateGAEvent(props);
    }

    componentWillUnmount() {
        // reset error state to prevent redirect loop rising from the "Not Found" error
        this.props.resetFetchRecord();
    }

    fetchDistribution(props) {
        // now check if we have distribution already fetched and if it's the correct one
        if (
            !props.distribution ||
            !props.distribution.identifier ||
            decodeURIComponent(props.match.params.distributionId) !==
                props.distribution.identifier
        ) {
            if (
                !props.distributionIsFetching &&
                !props.distributionFetchError
            ) {
                props.fetchDistribution(
                    decodeURIComponent(props.match.params.distributionId)
                );
            }
        }
    }

    fetchDataset(props) {
        if (
            !props.dataset ||
            !props.dataset.identifier ||
            decodeURIComponent(props.match.params.datasetId) !==
                props.dataset.identifier
        ) {
            if (!props.datasetIsFetching && !props.datasetFetchError) {
                props.fetchDataset(
                    decodeURIComponent(props.match.params.datasetId)
                );
            }
        }
    }

    updateGAEvent(props) {
        if (
            props.dataset &&
            props.dataset.identifier !== this.props.dataset.identifier
        ) {
            if (this.props.dataset.source !== "") {
                gapi.event({
                    category: "Dataset view by Source",
                    action: this.props.dataset.source,
                    label: this.props.dataset.title
                });
            }
            if (this.props.dataset.publisher.name !== "") {
                gapi.event({
                    category: "Dataset view by Publisher",
                    action: this.props.dataset.publisher.name,
                    label: this.props.dataset.title
                });
            }
        }
    }

    renderByState() {
        const searchText =
            queryString.parse(this.props.location.search).q || "";
        const publisherId = this.props.dataset.publisher
            ? this.props.dataset.publisher.id
            : null;

        const { dataset } = this.props;

        if (this.props.match.params.distributionId) {
            // on distribution detail page
            const baseUrlDistribution = `/dataset/${encodeURI(
                this.props.match.params.datasetId
            )}/distribution/${encodeURI(
                this.props.match.params.distributionId
            )}`;
            // load progress bar if fetching
            if (this.props.distributionIsFetching) {
                return <ProgressBar />;
            }
            // load error message if error occurs
            else if (this.props.distributionFetchError) {
                return (
                    <ErrorHandler error={this.props.distributionFetchError} />
                );
            }
            // load detail if distribution id in url matches the current distribution
            // this is to prevent flashing old content
            else if (
                this.props.distribution.identifier ===
                decodeURIComponent(this.props.match.params.distributionId)
            ) {
                return (
                    <div className="record--distribution">
                        <Medium>
                            <Breadcrumbs breadcrumbs={this.getBreadcrumbs()} />
                        </Medium>
                        <div className="row">
                            <div className="col-sm-12">
                                <span className="distribution-title">
                                    <img
                                        className="distribution-icon"
                                        src={getFormatIcon(
                                            this.props.distribution
                                        )}
                                        alt="distribution icon"
                                    />

                                    <h1>{this.props.distribution.title}</h1>
                                </span>
                                <div className="distribution-meta">
                                    <div className="publisher">
                                        <Link
                                            to={`/organisations/${publisherId}`}
                                        >
                                            {dataset.publisher.name}
                                        </Link>
                                    </div>

                                    {defined(
                                        this.props.distribution.updatedDate
                                    ) && (
                                        <span className="updated-date">
                                            <span className="separator hidden-sm">
                                                &nbsp;/&nbsp;
                                            </span>
                                            Updated{" "}
                                            {
                                                this.props.distribution
                                                    .updatedDate
                                            }
                                        </span>
                                    )}

                                    {defined(dataset.issuedDate) && (
                                        <span className="created-date">
                                            <span className="separator hidden-sm">
                                                &nbsp;/&nbsp;
                                            </span>
                                            Created{" "}
                                            {this.props.dataset.issuedDate}
                                        </span>
                                    )}
                                </div>
                                <div className="distribution-format">
                                    {this.props.distribution.format}
                                </div>
                                {defined(this.props.distribution.license) && (
                                    <span className="distribution-license">
                                        <span className="separator hidden-sm">
                                            &nbsp;/&nbsp;
                                        </span>
                                        {this.props.distribution.license}
                                    </span>
                                )}
                                <br />
                                {this.props.distribution.downloadURL ? (
                                    <a
                                        className="au-btn au-btn--primary distribution-download-button"
                                        href={
                                            this.props.distribution.downloadURL
                                        }
                                        onClick={() => {
                                            // google analytics download tracking
                                            const resource_url = encodeURIComponent(
                                                this.props.distribution
                                                    .downloadURL as string
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
                                                    category:
                                                        "Download by Dataset",
                                                    action: this.props.dataset
                                                        .title,
                                                    label: resource_url
                                                });
                                                gapi.event({
                                                    category:
                                                        "Download by Source",
                                                    action: this.props.dataset
                                                        .source,
                                                    label: resource_url
                                                });
                                                gapi.event({
                                                    category:
                                                        "Download by Publisher",
                                                    action: this.props.dataset
                                                        .publisher.name,
                                                    label: resource_url
                                                });
                                            }
                                        }}
                                    >
                                        <span
                                            style={{
                                                textDecoration:
                                                    "none !important"
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
                                {this.props.distribution.ckanResource &&
                                    this.props.distribution.ckanResource
                                        .datastore_active && (
                                        <a
                                            className="download-button au-btn au-btn--secondary"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            href={
                                                get(
                                                    this.props.distribution,
                                                    "sourceDetails.url"
                                                )
                                                    ? get(
                                                          this.props
                                                              .distribution,
                                                          "sourceDetails.url",
                                                          ""
                                                      ).replace(
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
                                        content={
                                            this.props.distribution.description
                                        }
                                        truncateLength={200}
                                    />
                                </Small>
                                <Medium>
                                    <DescriptionBox
                                        content={
                                            this.props.distribution.description
                                        }
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
                                                search: `?q=${searchText}`
                                            }}
                                        />
                                    </Switch>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            }
            // if all fails, we display an info message saying an error occured
            else {
                return null;
            }
        }
        return <RouteNotFound />;
    }

    // build breadcrumbs
    getBreadcrumbs() {
        const params = Object.keys(this.props.match.params);
        const searchPage =
            this.props.dataset.publishingState === "draft"
                ? "drafts"
                : "search";
        const results = (
            <li key="result">
                <Link
                    to={`/${searchPage}?q=${queryString.parse(
                        this.props.location.search
                    ).q || ""}`}
                >
                    Results
                </Link>
            </li>
        );
        const breadcrumbs = params.map(p => {
            if (p === "datasetId" && this.props.dataset.identifier) {
                // if no dataset identifier (eg, coming to distribution page directly from url rather than from dataset page)
                return (
                    <li key="datasetId">
                        <Link
                            to={`/dataset/${this.props.match.params[p]}${this.props.location.search}`}
                        >
                            {this.props.dataset.title}
                        </Link>
                    </li>
                );
            }

            if (p === "distributionId") {
                return (
                    <li key="distribution">
                        <span>{this.props.distribution.title}</span>
                    </li>
                );
            }
            return null;
        });
        breadcrumbs.unshift(results);
        return breadcrumbs;
    }

    render() {
        const title = this.props.match.params.distributionId
            ? this.props.distribution.title
            : this.props.dataset.title;
        const type = this.props.match.params.distributionId
            ? "Resources"
            : "Datasets";

        return (
            <MagdaDocumentTitle prefixes={[title, type]}>
                <div>{this.renderByState()}</div>
            </MagdaDocumentTitle>
        );
    }
}

function mapStateToProps(state) {
    const record = state.record;
    const dataset = record.dataset;
    const distribution = record.distribution;
    const datasetIsFetching = record.datasetIsFetching;
    const distributionIsFetching = record.distributionIsFetching;
    const datasetFetchError = record.datasetFetchError;
    const distributionFetchError = record.distributionFetchError;

    // for now, assume that if the user is admin, they can edit the data
    const hasEditPermissions =
        config.featureFlags.cataloguing &&
        state.userManagement &&
        state.userManagement.user &&
        state.userManagement.user.isAdmin;

    return {
        dataset,
        distribution,
        datasetIsFetching,
        distributionIsFetching,
        distributionFetchError,
        datasetFetchError,
        strings: state.content.strings,
        hasEditPermissions: hasEditPermissions ? true : false
    };
}

const mapDispatchToProps = dispatch => {
    return bindActionCreators(
        {
            fetchDataset: fetchDatasetFromRegistry,
            fetchDistribution: fetchDistributionFromRegistry,
            resetFetchRecord: resetFetchRecord
        },
        dispatch
    );
};
export default withRouter(
    connect(mapStateToProps, mapDispatchToProps)(DistributionPage)
);
