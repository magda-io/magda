import React from "react";
import { connect } from "react-redux";
import { Link, Route, Switch, Redirect } from "react-router-dom";
import ProgressBar from "../UI/ProgressBar";
import ReactDocumentTitle from "react-document-title";
import Breadcrumbs from "../UI/Breadcrumbs";
import { bindActionCreators } from "redux";
import {
    fetchDatasetFromRegistry,
    fetchDistributionFromRegistry
} from "../actions/recordActions";
import { config } from "../config";
import defined from "../helpers/defined";
import ga from "../analytics/googleAnalytics";
import ErrorHandler from "./ErrorHandler";
import RouteNotFound from "./RouteNotFound";
import DatasetDetails from "./Dataset/DatasetDetails";
import DistributionDetails from "./Dataset/DistributionDetails";
import DistributionPreview from "./Dataset/DistributionPreview";
import queryString from "query-string";
import DatasetSuggestForm from "./Dataset/DatasetSuggestForm";
import Separator from "../UI/Separator";
import { Small, Medium } from "../UI/Responsive";
import DescriptionBox from "../UI/DescriptionBox";
import DistributionIcon from "../assets/distribution_icon.svg";
import "./RecordHandler.css";

class RecordHandler extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            addMargin: false
        };
        this.getBreadcrumbs = this.getBreadcrumbs.bind(this);
    }

    componentDidMount() {
        this.props.fetchDataset(
            decodeURIComponent(this.props.match.params.datasetId)
        );
        if (this.props.match.params.distributionId) {
            this.props.fetchDistribution(
                decodeURIComponent(this.props.match.params.distributionId)
            );
        }
    }

    toggleMargin = addMargin => {
        this.setState({ addMargin });
    };

    componentDidUpdate(props) {
        if (
            props.match.params.datasetId !== this.props.match.params.datasetId
        ) {
            props.fetchDataset(
                decodeURIComponent(props.match.params.datasetId)
            );
        }
        if (
            props.match.params.distributionId &&
            props.match.params.distributionId !==
                this.props.match.params.distributionId
        ) {
            props.fetchDistribution(
                decodeURIComponent(props.match.params.distributionId)
            );
        }
    }

    renderByState() {
        const publisherName = this.props.dataset.publisher.name;
        const searchText =
            queryString.parse(this.props.location.search).q || "";
        const publisherId = this.props.dataset.publisher
            ? this.props.dataset.publisher.id
            : null;

        if (this.props.match.params.distributionId) {
            if (this.props.distributionIsFetching) {
                return <ProgressBar />;
            } else {
                if (this.props.distributionFetchError) {
                    return (
                        <ErrorHandler
                            error={this.props.distributionFetchError}
                        />
                    );
                }
                const baseUrlDistribution = `/dataset/${encodeURI(
                    this.props.match.params.datasetId
                )}/distribution/${encodeURI(
                    this.props.match.params.distributionId
                )}`;
                return (
                    <div className="">
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
                                    {publisherName}
                                </Link>
                            </div>
                            <Separator />
                            {defined(this.props.distribution.updatedDate) && (
                                <div className="updated-date">
                                    Updated{" "}
                                    {this.props.distribution.updatedDate}
                                </div>
                            )}
                            <Separator />
                            {defined(this.props.dataset.issuedDate) && (
                                <div className="created-date">
                                    Created {this.props.dataset.issuedDate}
                                </div>
                            )}
                        </div>
                        <div className="distribution-format">
                            {this.props.distribution.format}
                        </div>
                        <Separator />
                        <div className="distribution-license">
                            {this.props.distribution.license}
                        </div>
                        <br />
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
                                    ga("send", {
                                        hitType: "event",
                                        eventCategory: "Resource",
                                        eventAction: "Download",
                                        eventLabel: resource_url
                                    });
                                }
                            }}
                        >
                            Download
                        </a>{" "}
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
                                    to={`${baseUrlDistribution}/details?q=${searchText}`}
                                />
                            </Switch>
                        </div>
                    </div>
                );
            }
        } else if (this.props.match.params.datasetId) {
            if (this.props.datasetIsFetching) {
                return <ProgressBar />;
            } else {
                if (this.props.datasetFetchError) {
                    if (this.props.datasetFetchError.detail === "Not Found") {
                        return (
                            <Redirect
                                to={`/search?notfound=true&q="${encodeURI(
                                    this.props.match.params.datasetId
                                )}"`}
                            />
                        );
                    } else {
                        return (
                            <ErrorHandler
                                error={this.props.datasetFetchError}
                            />
                        );
                    }
                }

                const baseUrlDataset = `/dataset/${encodeURI(
                    this.props.match.params.datasetId
                )}`;

                return (
                    <div itemScope itemType="http://schema.org/Dataset">
                        <div
                            className={
                                this.state.addMargin ? "form-margin" : ""
                            }
                        >
                            <DatasetSuggestForm
                                title={this.props.dataset.title}
                                toggleMargin={this.toggleMargin}
                                datasetId={this.props.dataset.identifier}
                            />
                        </div>
                        <h1 className="dataset-title" itemProp="name">
                            {this.props.dataset.title}
                        </h1>
                        <div className="publisher-basic-info-row">
                            <span
                                itemProp="publisher"
                                itemScope
                                itemType="http://schema.org/Organization"
                            >
                                <Link to={`/organisations/${publisherId}`}>
                                    {publisherName}
                                </Link>
                            </span>
                            <span className="separator hidden-sm"> / </span>
                            {defined(this.props.dataset.issuedDate) && (
                                <span className="updated-date hidden-sm">
                                    Created{" "}
                                    <span itemProp="dateCreated">
                                        {this.props.dataset.issuedDate}
                                    </span>&nbsp;
                                </span>
                            )}
                            <span className="separator hidden-sm">
                                &nbsp;/&nbsp;
                            </span>
                            {defined(this.props.dataset.updatedDate) && (
                                <span className="updated-date hidden-sm">
                                    Updated{" "}
                                    <span itemProp="dateModified">
                                        {this.props.dataset.updatedDate}
                                    </span>
                                </span>
                            )}
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
                                    to={`${baseUrlDataset}/details?q=${searchText}`}
                                />
                                <Redirect
                                    exact
                                    from="/dataset/:datasetId/resource/*"
                                    to={`${baseUrlDataset}/details?q=${searchText}`}
                                />
                            </Switch>
                        </div>
                    </div>
                );
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
            if (p === "datasetId") {
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
        return (
            <ReactDocumentTitle title={title + "|" + config.appName}>
                <div>
                    <Breadcrumbs breadcrumbs={this.getBreadcrumbs()} />
                    {this.renderByState()}
                </div>
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
        datasetFetchError
    };
}

const mapDispatchToProps = dispatch => {
    return bindActionCreators(
        {
            fetchDataset: fetchDatasetFromRegistry,
            fetchDistribution: fetchDistributionFromRegistry
        },
        dispatch
    );
};
export default connect(
    mapStateToProps,
    mapDispatchToProps
)(RecordHandler);
