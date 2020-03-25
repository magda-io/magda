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
import DatasetPageDetails from "./View/DatasetPageDetails";
import queryString from "query-string";
import DatasetPageSuggestForm from "./View/DatasetPageSuggestForm";
import { Small, Medium } from "Components/Common/Responsive";
import DescriptionBox from "Components/Common/DescriptionBox";
import "./DatasetPage.scss";
import TagsBox from "Components/Common/TagsBox";
import ContactPoint from "Components/Common/ContactPoint";
import QualityIndicator from "Components/Common/QualityIndicator";
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

class DatasetPage extends React.Component<PropsType, StateType> {
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

        const { dataset, hasEditPermissions } = this.props;

        if (this.props.match.params.datasetId) {
            // on dataset detail page
            const baseUrlDataset = `/dataset/${encodeURI(
                this.props.match.params.datasetId
            )}`;
            // load progress bar if loading
            if (this.props.datasetIsFetching) {
                return <ProgressBar />;
            }
            // handle if error occurs
            else if (this.props.datasetFetchError) {
                if (this.props.datasetFetchError.detail === "Not Found") {
                    return (
                        <Redirect
                            to={`/error?errorCode=404&recordType=Dataset&recordId="${encodeURI(
                                this.props.match.params.datasetId
                            )}"`}
                        />
                    );
                } else {
                    return (
                        <ErrorHandler error={this.props.datasetFetchError} />
                    );
                }
            }

            // load detail if dataset id in url matches the current dataset
            // this is to prevent flashing old content
            else if (
                this.props.dataset.identifier ===
                decodeURIComponent(this.props.match.params.datasetId)
            ) {
                return (
                    <div
                        itemScope
                        itemType="http://schema.org/Dataset"
                        className="record--dataset"
                    >
                        <Medium>
                            <Breadcrumbs breadcrumbs={this.getBreadcrumbs()} />
                        </Medium>
                        {dataset.publishingState === "draft" ? (
                            <div className="au-page-alerts au-page-alerts--info">
                                <h3>Draft Dataset</h3>
                                <p>
                                    This dataset is a draft and has not been
                                    published yet. Once the dataset is approved,
                                    it will appear in your catalogue.
                                </p>
                            </div>
                        ) : null}
                        <div className="row">
                            <div className="col-sm-8">
                                <h1 itemProp="name">
                                    {this.props?.dataset?.title}
                                </h1>
                                <div className="publisher-basic-info-row">
                                    <span
                                        itemProp="publisher"
                                        className="publisher"
                                        itemScope
                                        itemType="http://schema.org/Organization"
                                    >
                                        <Link
                                            to={`/organisations/${publisherId}`}
                                            itemProp="url"
                                        >
                                            <span itemProp="name">
                                                {
                                                    this.props.dataset.publisher
                                                        .name
                                                }
                                            </span>
                                        </Link>
                                    </span>

                                    {defined(this.props.dataset.issuedDate) && (
                                        <span className="created-date hidden-sm">
                                            <span className="separator hidden-sm">
                                                {" "}
                                                /{" "}
                                            </span>
                                            Created{" "}
                                            <span itemProp="dateCreated">
                                                {this.props.dataset.issuedDate}
                                            </span>
                                            &nbsp;
                                        </span>
                                    )}

                                    {defined(
                                        this.props.dataset.updatedDate
                                    ) && (
                                        <span className="updated-date hidden-sm">
                                            <span className="separator hidden-sm">
                                                &nbsp;/&nbsp;
                                            </span>
                                            Updated{" "}
                                            <span itemProp="dateModified">
                                                {this.props.dataset.updatedDate}
                                            </span>
                                        </span>
                                    )}
                                    <div className="dataset-details-overview">
                                        <Small>
                                            <DescriptionBox
                                                content={
                                                    this.props.dataset
                                                        .description
                                                }
                                                truncateLength={200}
                                            />
                                        </Small>
                                        <Medium>
                                            <DescriptionBox
                                                content={
                                                    this.props.dataset
                                                        .description
                                                }
                                                truncateLength={500}
                                            />
                                        </Medium>
                                    </div>
                                    {this.props.dataset.hasQuality ? (
                                        <div className="quality-rating-box">
                                            <QualityIndicator
                                                quality={
                                                    this.props.dataset
                                                        .linkedDataRating
                                                }
                                            />
                                        </div>
                                    ) : null}
                                    {this.props.dataset.contactPoint ? (
                                        <ContactPoint
                                            contactPoint={
                                                this.props.dataset.contactPoint
                                            }
                                        />
                                    ) : (
                                        <></>
                                    )}
                                    <TagsBox tags={this.props.dataset.tags} />
                                </div>
                            </div>
                            <div
                                className={` col-sm-4 ${
                                    this.state.addMargin ? "form-margin" : ""
                                }`}
                            >
                                <DatasetPageSuggestForm
                                    title={this.props.dataset.title}
                                    toggleMargin={this.toggleMargin}
                                    datasetId={this.props.dataset.identifier}
                                />
                                {hasEditPermissions ? (
                                    <div className="dataset-button-container no-print">
                                        <button
                                            className="au-btn au-btn--secondary ask-question-button"
                                            onClick={() => {
                                                this.props.history.push({
                                                    pathname: `/dataset/edit/${this.props.dataset.identifier}`
                                                });
                                            }}
                                        >
                                            Edit the Dataset
                                        </button>
                                    </div>
                                ) : null}
                            </div>
                        </div>
                        <div className="tab-content">
                            <Switch>
                                <Route
                                    path="/dataset/:datasetId/details"
                                    component={DatasetPageDetails}
                                />
                                <Redirect
                                    exact
                                    from="/dataset/:datasetId"
                                    to={{
                                        pathname: `${baseUrlDataset}/details`,
                                        search: `?q=${searchText}`
                                    }}
                                />
                                <Redirect
                                    exact
                                    from="/dataset/:datasetId/resource/*"
                                    to={{
                                        pathname: `${baseUrlDataset}/details`,
                                        search: `?q=${searchText}`
                                    }}
                                />
                            </Switch>
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
    connect(mapStateToProps, mapDispatchToProps)(DatasetPage)
);
