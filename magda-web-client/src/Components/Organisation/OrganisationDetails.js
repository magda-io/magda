import React, { Component } from "react";
import { connect } from "react-redux";
import { bindActionCreators } from "redux";
import { Link } from "react-router-dom";
import ErrorHandler from "../../Components/ErrorHandler";
import { config } from "../../config";
import ReactDocumentTitle from "react-document-title";
import { fetchOrganisationIfNeeded } from "../../actions/organisationActions";
import OverviewBox from "../../UI/OverviewBox";
import ProgressBar from "../../UI/ProgressBar";
import Breadcrumbs from "../../UI/Breadcrumbs";

import "./OrganisationDetails.css";

class OrganisationDetails extends Component {
    componentWillMount() {
        this.props.fetchOrganisationIfNeeded(
            this.props.match.params.organisationId
        );
    }

    componentWillReceiveProps(nextProps) {
        if (
            nextProps.match.params.organisationId !==
            this.props.match.params.organisationId
        ) {
            nextProps.fetchOrganisationIfNeeded(
                nextProps.match.params.organisationId
            );
        }
    }

    renderContent() {
        const organisation = this.props.organisation;
        const details = organisation.aspects["organization-details"];
        const description =
            details.description && details.description.length > 0
                ? details.description
                : "This organisation has no description";

        const breadcrumbs = [
            <li>
                <Link to="/organisations">Organisations</Link>
            </li>,
            <li>
                <span>{organisation.name}</span>
            </li>
        ];
        return (
            <div className="organisation-details">
                {this.props.isFetching && <ProgressBar />}
                <div>
                    <Breadcrumbs breadcrumbs={breadcrumbs} />
                    <div className="organisation-details__body col-sm-8">
                        <div className="media">
                            <div className="media-body">
                                <h1>{organisation.name}</h1>
                            </div>
                        </div>

                        <div className="organisation-details-overview">
                            <h3 className="section-heading">Overview</h3>
                            <OverviewBox content={description} />
                        </div>
                        <br />
                        <div>
                            <Link
                                className="au-cta-link"
                                to={`/search?organisation=${encodeURIComponent(
                                    organisation.name
                                )}`}
                            >
                                View all datasets from {organisation.name}
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
                title={this.props.organisation.name + " | " + config.appName}
            >
                {this.renderContent()}
            </ReactDocumentTitle>
        );
    }
}

function mapDispatchToProps(dispatch) {
    return bindActionCreators(
        {
            fetchOrganisationIfNeeded: fetchOrganisationIfNeeded
        },
        dispatch
    );
}

function mapStateToProps(state: Object, ownProps: Object) {
    const organisation: Object = state.organisation.organisation;
    const isFetching: boolean = state.organisation.isFetchingOrganisation;
    const error: object = state.organisation.errorFetchingOrganisation;
    const location: Location = ownProps.location;
    return {
        organisation,
        isFetching,
        location,
        error
    };
}

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(OrganisationDetails);
