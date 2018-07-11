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
import debounce from "lodash.debounce";
import Pagination from "../../UI/Pagination";
import "./PublishersViewer.css";
import search from "../../assets/search-dark.svg";
import { Medium } from "../../UI/Responsive";

class PublishersViewer extends Component {
    constructor(props) {
        super(props);
        this.onUpdateSearchText = this.onUpdateSearchText.bind(this);
        this.handleSearchFieldEnterKeyPress = this.handleSearchFieldEnterKeyPress.bind(
            this
        );
        this.onPageChange = this.onPageChange.bind(this);
    }
    debounceUpdateSearchQuery = debounce(this.updateSearchQuery, 3000);

    onPageChange(i) {
        this.context.router.history.push({
            pathname: this.props.location.pathname,
            search: queryString.stringify(
                Object.assign(queryString.parse(this.props.location.search), {
                    page: i
                })
            )
        });

        this.updateSearchQuery(
            queryString.parse(this.props.location.search).q,
            i
        );
    }

    componentDidMount() {
        const q = queryString.parse(this.props.location.search).q;

        this.props.fetchPublishersIfNeeded(
            getPageNumber(this.props) || 1,
            q && q.trim() > 0 ? q : "*"
        );
    }

    updateQuery(query) {
        this.context.router.history.push({
            pathname: "/organisations",
            search: queryString.stringify(
                Object.assign(
                    queryString.parse(this.props.location.search),
                    query
                )
            )
        });
    }

    handleSearchFieldEnterKeyPress(event) {
        // when user hit enter, no need to submit the form
        if (event.charCode === 13) {
            event.preventDefault();
            this.updateSearchQuery(
                queryString.parse(this.props.location.search).q,
                1
            );
        }
    }

    updateSearchQuery(text, page) {
        this.debounceUpdateSearchQuery.flush();
        if (text && text.trim() === "") text = "*";
        const pageIndex = page
            ? page
            : getPageNumber(this.props)
                ? getPageNumber(this.props)
                : 1;
        this.props.fetchPublishersIfNeeded(pageIndex, text);
    }

    onUpdateSearchText(e) {
        this.updateQuery({
            q: e.target.value,
            page: 1
        });
        this.debounceUpdateSearchQuery(e.target.value, 1);
    }

    renderContent() {
        if (this.props.error) {
            return <ErrorHandler error={this.props.error} />;
        } else {
            if (this.props.publishers.length === 0) {
                return <div> no results</div>;
            }
            return (
                <div>
                    {this.props.publishers.map(p => (
                        <PublisherSummary publisher={p} key={p.identifier} />
                    ))}
                </div>
            );
        }
    }

    renderSearchBar() {
        const q = queryString.parse(this.props.location.search).q;
        return (
            <div className="organization-search">
                <label htmlFor="organization-search" className="sr-only">
                    Search for organisations
                </label>
                <input
                    className="au-text-input au-text-input--block organization-search"
                    name="organization-search"
                    id="organization-search"
                    type="text"
                    value={q ? q : " "}
                    placeholder="Search for organisations"
                    onChange={this.onUpdateSearchText}
                    onKeyPress={this.handleSearchFieldEnterKeyPress}
                />
                <img className="search-icon" src={search} alt="search" />
            </div>
        );
    }

    render() {
        return (
            <ReactDocumentTitle title={"Organisations | " + config.appName}>
                <div className="publishers-viewer">
                    <Medium>
                        <Breadcrumbs
                            breadcrumbs={[
                                <li key="organisations">
                                    <span>Organisations</span>
                                </li>
                            ]}
                        />
                    </Medium>
                    <h1>Organisations</h1>
                    <div className="row">
                        <div className="col-sm-8">
                            {!this.props.isFetching && this.renderContent()}
                        </div>
                        {this.props.isFetching && <ProgressBar />}
                        <div className="col-sm-4">{this.renderSearchBar()}</div>
                    </div>
                    {this.props.hitCount > config.resultsPerPage && (
                        <Pagination
                            currentPage={
                                +queryString.parse(this.props.location.search)
                                    .page || 1
                            }
                            maxPage={Math.ceil(
                                this.props.hitCount / config.resultsPerPage
                            )}
                            onPageChange={this.onPageChange}
                            totalItems={this.props.hitCount}
                        />
                    )}
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
