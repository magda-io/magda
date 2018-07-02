import React, { Component } from "react";
import { connect } from "react-redux";
import { config } from "../../config";
import { bindActionCreators } from "redux";
import { fetchPublishersIfNeeded } from "../../actions/publisherActions";
import ReactDocumentTitle from "react-document-title";
import PublisherSummary from "./PublisherSummary";
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
import "./PublishersViewer.css";

class PublishersViewer extends Component {
    componentDidMount() {
        this.props.fetchPublishersIfNeeded(getPageNumber(this.props) || 1);
    }

    componentDidUpdate(prevProps) {
        if (getPageNumber(this.props) !== getPageNumber(prevProps)) {
            this.props.fetchPublishersIfNeeded(getPageNumber(this.props) || 1);
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

    mergedPublishers() {
        const publishers = reduce(
            this.props.publishers,
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
        return publishers;
    }

    renderContent() {
        if (this.props.error) {
            return <ErrorHandler error={this.props.error} />;
        } else {
            return (
                <div className="col-sm-8">
                    {sortBy(this.mergedPublishers(), [
                        function(o) {
                            return o.name.toLowerCase();
                        }
                    ]).map(p => <PublisherSummary publisher={p} key={p.id} />)}
                </div>
            );
        }
    }

    render() {
        return (
            <ReactDocumentTitle title={"Organisations | " + config.appName}>
                <div className="publishers-viewer">
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
            fetchPublishersIfNeeded: fetchPublishersIfNeeded
        },
        dispatch
    );
}

function mapStateToProps(state, ownProps) {
    const publishers: Array<Object> = state.publisher.publishers;
    const isFetching: boolean = state.publisher.isFetchingPublishers;
    const hitCount: number = state.publisher.hitCount;
    const error: Object = state.publisher.errorFetchingPublishers;
    const location: Location = ownProps.location;
    return {
        publishers,
        isFetching,
        hitCount,
        location,
        error
    };
}

PublishersViewer.contextTypes = {
    router: PropTypes.object.isRequired
};

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(PublishersViewer);
