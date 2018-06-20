import React, { Component } from "react";
import { connect } from "react-redux";
import { config } from "../../config";
import { bindActionCreators } from "redux";
import { fetchOrganisationsIfNeeded } from "../../actions/organisationActions";
import ReactDocumentTitle from "react-document-title";
import OrganisationSummary from "./OrganisationSummary";
import ErrorHandler from "../../Components/ErrorHandler";
import getPageNumber from "../../helpers/getPageNumber";
import ProgressBar from "../../UI/ProgressBar";
import Breadcrumbs from "../../UI/Breadcrumbs";
import queryString from "query-string";
import PropTypes from "prop-types";
import sortBy from "lodash.sortby";
import reduce from "lodash/reduce";
import findIndex from "lodash/findIndex";
import trim from "lodash/trim";
import "./OrganisationsViewer.css";

class OrganisationsViewer extends Component {
    componentWillMount() {
        this.props.fetchOrganisationsIfNeeded(getPageNumber(this.props) || 1);
    }

    componentWillReceiveProps(nextProps) {
        if (getPageNumber(this.props) !== getPageNumber(nextProps)) {
            nextProps.fetchOrganisationsIfNeeded(getPageNumber(nextProps) || 1);
        }
    }

    onPageChange(i) {
        this.context.router.history.push({
            pathname: this.props.location.pathname,
            search: queryString.stringify(
                Object.assign(queryString.parse(this.props.location.search), {
                    page: i
                })
            )
        });
    }

    mergedOrganisations() {
        const organisations = reduce(
            this.props.organisations,
            (r, p) => {
                const idx = findIndex(
                    r,
                    item =>
                        trim(item.name).toLowerCase() ===
                        trim(p.name).toLowerCase()
                );
                if (idx === -1) {
                    r.push(p);
                    return r;
                } else {
                    const findItem = r[idx];
                    if (
                        !p.aspects ||
                        !p.aspects["organization-details"] ||
                        !p.aspects["organization-details"]["description"]
                    )
                        return r;
                    else if (
                        !findItem.aspects ||
                        !findItem.aspects["organization-details"] ||
                        !findItem.aspects["organization-details"]["description"]
                    ) {
                        r.splice(idx, 1, p);
                        return r;
                    } else {
                        if (
                            trim(
                                p.aspects["organization-details"]["description"]
                            ).length >
                            trim(
                                findItem.aspects["organization-details"][
                                    "description"
                                ]
                            ).length
                        ) {
                            r.splice(idx, 1, p);
                            return r;
                        } else {
                            return r;
                        }
                    }
                }
            },
            []
        );
        return organisations;
    }

    renderContent() {
        if (this.props.error) {
            return <ErrorHandler error={this.props.error} />;
        } else {
            return (
                <div className="col-sm-8">
                    {sortBy(this.mergedOrganisations(), [
                        function(o) {
                            return o.name.toLowerCase();
                        }
                    ]).map(p => (
                        <OrganisationSummary organisation={p} key={p.id} />
                    ))}
                </div>
            );
        }
    }

    render() {
        return (
            <ReactDocumentTitle title={"Organisations | " + config.appName}>
                <div className="organisations-viewer">
                    <Breadcrumbs
                        breadcrumbs={[
                            <li>
                                <span>Organisations</span>
                            </li>
                        ]}
                    />
                    <h1>Organisations</h1>
                    <div className="row">
                        {!this.props.isFetching && this.renderContent()}
                        {this.props.isFetching && <ProgressBar />}
                    </div>
                </div>
            </ReactDocumentTitle>
        );
    }
}

function mapDispatchToProps(dispatch: Function) {
    return bindActionCreators(
        {
            fetchOrganisationsIfNeeded: fetchOrganisationsIfNeeded
        },
        dispatch
    );
}

function mapStateToProps(state, ownProps) {
    const organisations: Array<Object> = state.organisation.organisations;
    const isFetching: boolean = state.organisation.isFetchingOrganisations;
    const hitCount: number = state.organisation.hitCount;
    const error: Object = state.organisation.errorFetchingOrganisations;
    const location: Location = ownProps.location;
    return {
        organisations,
        isFetching,
        hitCount,
        location,
        error
    };
}

OrganisationsViewer.contextTypes = {
    router: PropTypes.object.isRequired
};

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(OrganisationsViewer);
