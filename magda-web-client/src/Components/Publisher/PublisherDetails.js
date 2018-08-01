import React, { Component } from "react";
import { connect } from "react-redux";
import { bindActionCreators } from "redux";
import { Link } from "react-router-dom";
import ErrorHandler from "../../Components/ErrorHandler";
import { config } from "../../config";
import ReactDocumentTitle from "react-document-title";
import { fetchPublisherIfNeeded } from "../../actions/publisherActions";
import OverviewBox from "../../UI/OverviewBox";
import ProgressBar from "../../UI/ProgressBar";
import Breadcrumbs from "../../UI/Breadcrumbs";
import { Medium } from "../../UI/Responsive";

import "./PublisherDetails.css";

class PublisherDetails extends Component {
    componentDidMount() {
        this.props.fetchPublisherIfNeeded(this.props.match.params.publisherId);
    }

    componentDidUpdate(prevProps) {
        if (
            prevProps.match.params.publisherId !==
            this.props.match.params.publisherId
        ) {
            this.props.fetchPublisherIfNeeded(
                this.props.match.params.publisherId
            );
        }
    }

    renderContent() {
        const publisher = this.props.publisher;
        const details = publisher.aspects["organization-details"];
        const description =
            details.description && details.description.length > 0
                ? details.description
                : "This publisher has no description";

        const breadcrumbs = [
            <li>
                <Link to="/organisations">Organisations</Link>
            </li>,
            <li>
                <span>{publisher.name}</span>
            </li>
        ];
        return (
            <div className="publisher-details">
                {this.props.isFetching && <ProgressBar />}
                <div>
                    <Medium>
                        <Breadcrumbs breadcrumbs={breadcrumbs} />
                    </Medium>
                    <div className="publisher-details__body">
                        <div className="media">
                            <div className="media-body">
                                <h1>{publisher.name}</h1>
                            </div>
                        </div>

                        <div className="publisher-details-overview">
                            <h3 className="section-heading">Overview</h3>
                            <OverviewBox content={description} />
                        </div>
                        <br />
                        <div>
                            <Link
                                className="au-cta-link"
                                to={{
                                    pathname: "/search",
                                    search: `?publisher=${encodeURIComponent(
                                        publisher.name
                                    )}`,
                                    state: {
                                        showFilterExplanation: true
                                    }
                                }}
                            >
                                View all datasets from {publisher.name}
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    render() {
        if (this.props.error) {
            return <ErrorHandler error={this.props.error} />;
        }
        return (
            <ReactDocumentTitle
                title={this.props.publisher.name + " | " + config.appName}
            >
                {this.renderContent()}
            </ReactDocumentTitle>
        );
    }
}

function mapDispatchToProps(dispatch) {
    return bindActionCreators(
        {
            fetchPublisherIfNeeded: fetchPublisherIfNeeded
        },
        dispatch
    );
}

function mapStateToProps(state: Object, ownProps: Object) {
    const publisher: Object = state.publisher.publisher;
    const isFetching: boolean = state.publisher.isFetchingPublisher;
    const error: object = state.publisher.errorFetchingPublisher;
    const location: Location = ownProps.location;
    return {
        publisher,
        isFetching,
        location,
        error
    };
}

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(PublisherDetails);
