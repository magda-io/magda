import React from "react";
import { connect } from "react-redux";
import {
    Link,
    Redirect,
    withRouter,
    RouteComponentProps
} from "react-router-dom";
import ProgressBar from "Components/Common/ProgressBar";
import MagdaDocumentTitle from "Components/i18n/MagdaDocumentTitle";
import { bindActionCreators } from "redux";
import {
    fetchDatasetFromRegistry,
    fetchDistributionFromRegistry,
    resetFetchRecord
} from "actions/recordActions";
import { gapi } from "analytics/ga";
import ErrorHandler from "Components/Error/ErrorHandler";
import RouteNotFound from "Components/Error/RouteNotFoundPage";
import queryString from "query-string";

import "./DatasetPage.scss";

import { config } from "config";
import { ParsedDataset, ParsedDistribution } from "helpers/record";
import { FetchError } from "types";
import DatasetPage from "./DatasetPage";
import DistributionPage from "./DistributionPage";

interface RecordHandlerPropsType
    extends RouteComponentProps<{
        datasetId?: string;
        distributionId?: string;
    }> {
    dataset: ParsedDataset;
    distribution: ParsedDistribution;
    datasetIsFetching: boolean;
    distributionIsFetching: boolean;
    datasetFetchError?: FetchError;
    distributionFetchError?: FetchError;
    hasEditPermissions: boolean;
    resetFetchRecord: Function;
    isAdmin: boolean;
}

interface StateType {
    addMargin: boolean;
}

class RecordHandler extends React.Component<RecordHandlerPropsType, StateType> {
    constructor(props) {
        super(props);
        this.state = {
            addMargin: false
        };
        this.getBreadcrumbs = this.getBreadcrumbs.bind(this);
    }

    toggleMargin = (addMargin) => {
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
            if (this.props?.dataset?.publisher?.name !== "") {
                gapi.event({
                    category: "Dataset view by Publisher",
                    action: this.props?.dataset?.publisher?.name,
                    label: this.props.dataset.title
                });
            }
        }
    }

    renderByState() {
        const searchText =
            queryString.parse(this.props.location.search).q || "";

        const { dataset, hasEditPermissions } = this.props;

        if (this.props.match.params.distributionId) {
            // on distribution detail page
            // load progress bar if fetching
            if (this.props.distributionIsFetching) {
                return <ProgressBar />;
            }
            // load error message if error occurs
            else if (this.props.distributionFetchError) {
                return (
                    <ErrorHandler error={this.props.distributionFetchError} />
                );
            } // load detail if distribution id in url matches the current distribution
            // this is to prevent flashing old content
            else if (
                this.props.distribution.identifier ===
                decodeURIComponent(this.props.match.params.distributionId)
            ) {
                return (
                    <DistributionPage
                        datasetId={this.props.match.params.datasetId!}
                        dataset={dataset}
                        distributionId={this.props.match.params.distributionId}
                        distribution={this.props.distribution}
                        breadcrumbs={this.getBreadcrumbs()}
                        searchText={searchText}
                    />
                );
            } else {
                return null;
            }
        } else if (this.props.match.params.datasetId) {
            // on dataset detail page
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
                    <DatasetPage
                        datasetId={this.props.match.params.datasetId}
                        dataset={dataset}
                        breadcrumbs={this.getBreadcrumbs()}
                        searchText={searchText}
                        hasEditPermissions={hasEditPermissions}
                        isAdmin={this.props.isAdmin}
                    />
                );
            } else {
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
                    to={`/${searchPage}?q=${
                        queryString.parse(this.props.location.search).q || ""
                    }`}
                >
                    Results
                </Link>
            </li>
        );
        const breadcrumbs = params.map((p) => {
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
        (config.featureFlags.cataloguing &&
            state.userManagement &&
            state.userManagement.user &&
            state.userManagement.user.isAdmin) ||
        config.featureFlags.previewAddDataset;

    const isAdmin = state?.userManagement?.user?.isAdmin ? true : false;

    return {
        dataset,
        distribution,
        datasetIsFetching,
        distributionIsFetching,
        distributionFetchError,
        datasetFetchError,
        strings: state.content.strings,
        hasEditPermissions: hasEditPermissions ? true : false,
        isAdmin
    };
}

const mapDispatchToProps = (dispatch) => {
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
    connect(mapStateToProps, mapDispatchToProps)(RecordHandler)
);
