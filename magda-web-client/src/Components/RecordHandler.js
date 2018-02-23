import React from "react";
import { connect } from "react-redux";
import ProgressBar from "../UI/ProgressBar";
import ReactDocumentTitle from "react-document-title";
import { bindActionCreators } from "redux";
import {
    fetchDatasetFromRegistry,
    fetchDistributionFromRegistry
} from "../actions/recordActions";
import Tabs from "../UI/Tabs";
import { config } from "../config";
import ErrorHandler from "./ErrorHandler";
import RouteNotFound from "./RouteNotFound";
import { Route, Link, Switch, Redirect } from "react-router-dom";
import DatasetDetails from "./Dataset/DatasetDetails";
import DistributionDetails from "./Dataset/DistributionDetails";
import DistributionPreview from "./Dataset/DistributionPreview";

class RecordHandler extends React.Component {
    componentWillMount() {
        this.props.fetchDataset(this.props.match.params.datasetId);
        if (this.props.match.params.distributionId) {
            this.props.fetchDistribution(
                this.props.match.params.distributionId
            );
        }
    }
    componentWillReceiveProps(nextProps) {
        if (
            nextProps.match.params.datasetId !==
            this.props.match.params.datasetId
        ) {
            nextProps.fetchDataset(nextProps.match.params.datasetId);
        }
        if (
            nextProps.match.params.distributionId &&
            nextProps.match.params.distributionId !==
                this.props.match.params.distributionId
        ) {
            nextProps.fetchDistribution(nextProps.match.params.distributionId);
        }
    }

    renderBreadCrumbs(dataset, distribution) {
        return (
            <ul className="breadcrumb">
                <li className="breadcrumb-item">
                    <Link to="/">Home</Link>
                </li>
                <li className="breadcrumb-item">
                    {distribution ? (
                        <Link
                            to={`/dataset/${encodeURIComponent(
                                dataset.identifier
                            )}`}
                        >
                            {dataset.title}
                        </Link>
                    ) : (
                        dataset.title
                    )}
                </li>
                {distribution && (
                    <li className="breadcrumb-item">{distribution.title}</li>
                )}
            </ul>
        );
    }

    renderByState() {
        const publisherName = this.props.dataset.publisher.name;
        // const publisherId = this.props.dataset.publisher ? this.props.dataset.publisher.id : null;
        const distributionIdAsUrl = this.props.match.params.distributionId
            ? encodeURIComponent(this.props.match.params.distributionId)
            : "";
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
                const tabList = [
                    { id: "details", name: "Details", isActive: true },
                    { id: "preview", name: "Preview", isActive: true }
                ];
                const baseUrlDistribution = `/dataset/${encodeURIComponent(
                    this.props.match.params.datasetId
                )}/distribution/${distributionIdAsUrl}`;
                return (
                    <div>
                        <div className="container">
                            {this.renderBreadCrumbs(
                                this.props.dataset,
                                this.props.distribution
                            )}
                            <div className="media">
                                <div className="media-body">
                                    <h1>{this.props.distribution.title}</h1>
                                    <div className="publisher">
                                        {publisherName}
                                    </div>
                                    <div className="updated-date">
                                        Updated{" "}
                                        {this.props.distribution.updatedDate}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <Tabs
                            list={tabList}
                            baseUrl={baseUrlDistribution}
                            onTabChange={tab => {
                                console.log(tab);
                            }}
                        />
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
                                    to={`${baseUrlDistribution}/details`}
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
                    return (
                        <ErrorHandler error={this.props.datasetFetchError} />
                    );
                }
                // const datasetTabs = [
                //   {id: 'details', name: 'Details', isActive: true},
                //   {id:  'discussion', name: 'Discussion', isActive: !config.disableAuthenticationFeatures},
                //   {id: 'publisher', name: 'About ' + publisherName, isActive: publisherId},
                // ];

                const baseUrlDataset = `/dataset/${encodeURIComponent(
                    this.props.match.params.datasetId
                )}`;

                return (
                    <div>
                        <div className="container media">
                            {this.renderBreadCrumbs(this.props.dataset)}
                            <div className="media-body">
                                <h1>{this.props.dataset.title}</h1>
                                <div className="publisher">{publisherName}</div>
                                <div className="updated-date">
                                    Updated {this.props.dataset.updatedDate}
                                </div>
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
                                    to={`${baseUrlDataset}/details`}
                                />
                            </Switch>
                        </div>
                    </div>
                );
            }
        }
        return <RouteNotFound />;
    }

    render() {
        const title = this.props.match.params.distributionId
            ? this.props.distribution.title
            : this.props.dataset.title;
        return (
            <ReactDocumentTitle title={title + "|" + config.appName}>
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
export default connect(mapStateToProps, mapDispatchToProps)(RecordHandler);
