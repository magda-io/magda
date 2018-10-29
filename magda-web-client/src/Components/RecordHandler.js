import React from "react";
import { connect } from "react-redux";
import { Link, Route, Switch, Redirect } from "react-router-dom";
import ProgressBar from "../UI/ProgressBar";
import ReactDocumentTitle from "react-document-title";
import Breadcrumbs from "../UI/Breadcrumbs";
import { bindActionCreators } from "redux";
import {
    fetchDatasetFromRegistry,
    fetchDistributionFromRegistry,
    resetFetchRecord
} from "../actions/recordActions";
import defined from "../helpers/defined";
import { gapi } from "../analytics/ga";
import ErrorHandler from "./ErrorHandler";
import RouteNotFound from "./RouteNotFound";
import DatasetDetails from "./Dataset/DatasetDetails";
import DistributionDetails from "./Dataset/DistributionDetails";
import DistributionPreview from "./Dataset/DistributionPreview";
import queryString from "query-string";
import DatasetSuggestForm from "./Dataset/DatasetSuggestForm";
import { Small, Medium } from "../UI/Responsive";
import DescriptionBox from "../UI/DescriptionBox";
import DistributionIcon from "../assets/distribution_icon.svg";
import "./RecordHandler.css";
import TagsBox from "../UI/TagsBox";
import ContactPoint from "../UI/ContactPoint";
import QualityIndicator from "../UI/QualityIndicator";

class RecordHandler extends React.Component {
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
                        <span className="distribution-title">
                            <img
                                className="distribution-icon"
                                src={DistributionIcon}
                                alt="distribution icon"
                            />
                            <h1>{this.props.distribution.title}</h1>
                        </span>
                        <div className="distribution-meta">
                            <div className="publisher">
                                <Link to={`/organisations/${publisherId}`}>
                                    {this.props.dataset.publisher.name}
                                </Link>
                            </div>

                            {defined(this.props.distribution.updatedDate) && (
                                <span className="updated-date">
                                    <span className="separator hidden-sm">
                                        &nbsp;/&nbsp;
                                    </span>
                                    Updated{" "}
                                    {this.props.distribution.updatedDate}
                                </span>
                            )}

                            {defined(this.props.dataset.issuedDate) && (
                                <span className="created-date">
                                    <span className="separator hidden-sm">
                                        &nbsp;/&nbsp;
                                    </span>
                                    Created {this.props.dataset.issuedDate}
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
                                className="au-btn distribution-download-button"
                                href={this.props.distribution.downloadURL}
                                alt="distribution download button"
                                onClick={() => {
                                    // google analytics download tracking
                                    const resource_url = encodeURIComponent(
                                        this.props.distribution.downloadURL
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
                                            action: this.props.dataset.title,
                                            label: resource_url
                                        });
                                        gapi.event({
                                            category: "Download by Source",
                                            action: this.props.dataset.source,
                                            label: resource_url
                                        });
                                        gapi.event({
                                            category: "Download by Publisher",
                                            action: this.props.dataset,
                                            label: resource_url
                                        });
                                    }
                                }}
                            >
                                Download
                            </a>
                        ) : null}{" "}
                        <Small>
                            <DescriptionBox
                                content={this.props.distribution.description}
                                truncateLength={200}
                            />
                        </Small>
                        <Medium>
                            <DescriptionBox
                                content={this.props.distribution.description}
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
                );
            }
            // if all fails, we display an info message saying an error occured
            else {
                return null;
            }
        } else if (this.props.match.params.datasetId) {
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
                        <div className="row">
                            <div className="col-sm-8">
                                <h1 itemProp="name">
                                    {this.props.dataset.title}
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
                                        >
                                            {this.props.dataset.publisher.name}
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
                                    {this.props.dataset.linkedDataRating && (
                                        <div className="quality-rating-box">
                                            <QualityIndicator
                                                quality={
                                                    this.props.dataset
                                                        .linkedDataRating
                                                }
                                            />
                                        </div>
                                    )}
                                    {this.props.dataset.contactPoint && (
                                        <ContactPoint
                                            contactPoint={
                                                this.props.dataset.contactPoint
                                            }
                                        />
                                    )}
                                    <TagsBox tags={this.props.dataset.tags} />
                                </div>
                            </div>
                            <div
                                className={` col-sm-4 ${
                                    this.state.addMargin ? "form-margin" : ""
                                }`}
                            >
                                <DatasetSuggestForm
                                    title={this.props.dataset.title}
                                    toggleMargin={this.toggleMargin}
                                    datasetId={this.props.dataset.identifier}
                                />
                            </div>
                        </div>
                        <div className="tab-content">
                            <Switch>
                                <Route
                                    path="/dataset/:datasetId/details"
                                    component={DatasetDetails}
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
        const results = (
            <li key="result">
                <Link
                    to={`/search?q=${queryString.parse(
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
                            to={`/dataset/${this.props.match.params[p]}${
                                this.props.location.search
                            }`}
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
            <ReactDocumentTitle
                title={`${title} | ${type} | ${
                    this.props.strings.applicationName
                }`}
            >
                <div>{this.renderByState()}</div>
            </ReactDocumentTitle>
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

    return {
        dataset,
        distribution,
        datasetIsFetching,
        distributionIsFetching,
        distributionFetchError,
        datasetFetchError,
        strings: state.content.strings
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
export default connect(
    mapStateToProps,
    mapDispatchToProps
)(RecordHandler);
