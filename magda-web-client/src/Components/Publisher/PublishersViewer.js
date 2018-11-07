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
import AUpageAlert from "../../pancake/react/page-alerts";
import { withRouter } from "react-router-dom";
import { NamespacesConsumer } from "react-i18next";

class PublishersViewer extends Component {
    constructor(props) {
        super(props);
        this.state = {
            inputText: ""
        };
        this.onUpdateSearchText = this.onUpdateSearchText.bind(this);
        this.handleSearchFieldEnterKeyPress = this.handleSearchFieldEnterKeyPress.bind(
            this
        );
        this.onPageChange = this.onPageChange.bind(this);
        this.clearSearch = this.clearSearch.bind(this);
        this.onClickSearch = this.onClickSearch.bind(this);
        this.searchInputFieldRef = null;
        props.history.listen(location => {
            this.debounceUpdateSearchQuery.cancel();
        });
    }

    debounceUpdateSearchQuery = debounce(this.updateSearchQuery, 3000);

    onPageChange(i) {
        this.debounceUpdateSearchQuery(
            queryString.parse(this.props.location.search).q,
            i
        );
        this.debounceUpdateSearchQuery.flush();
    }

    componentDidUpdate(prevProps) {
        if (prevProps.location.search !== this.props.location.search) {
            this.debounceUpdateSearchQuery.cancel();
            this.fetchData();
        }
    }

    componentDidMount() {
        const { q } = queryString.parse(this.props.location.search);
        const inputText = q && q.trim().length > 0 ? q : "";
        this.setState({ inputText });
        this.fetchData();
    }

    updateQuery(query) {
        if (
            typeof query.q === "undefined" &&
            typeof query.page === "undefined"
        ) {
            this.context.router.history.push({
                pathname: "/organisations"
            });
        } else {
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
    }

    fetchData() {
        const { q, page } = queryString.parse(this.props.location.search);
        let searchText = "*";
        if (q && q.trim().length > 0) {
            searchText = q;
        }
        const pageIndex = page
            ? page
            : getPageNumber(this.props)
                ? getPageNumber(this.props)
                : 1;
        this.props.fetchPublishersIfNeeded(pageIndex, searchText);
    }

    handleSearchFieldEnterKeyPress(event) {
        if (event.charCode === 13) {
            this.debounceUpdateSearchQuery(this.state.inputText, 1);
            this.debounceUpdateSearchQuery.flush();
        }
    }

    updateSearchQuery(text, page) {
        if (this.searchInputFieldRef) this.searchInputFieldRef.blur();
        this.updateQuery({
            q: text ? text.trim() : text,
            page: page
        });
    }

    clearSearch() {
        this.setState({
            inputText: ""
        });
        this.debounceUpdateSearchQuery();
        this.debounceUpdateSearchQuery.flush();
    }

    onUpdateSearchText(e) {
        this.setState({ inputText: e.target.value });
        this.debounceUpdateSearchQuery(e.target.value, 1);
    }

    onClickSearch() {
        this.debounceUpdateSearchQuery(this.state.inputText, 1);
        this.debounceUpdateSearchQuery.flush();
    }

    renderContent(translate) {
        if (this.props.error) {
            return <ErrorHandler error={this.props.error} />;
        } else {
            if (this.props.publishers.length === 0) {
                return (
                    <AUpageAlert as="error">
                        {translate("noPublishersMatchSearchMessage")}
                        <button
                            className="clear-btn au-btn au-btn--tertiary"
                            type="button"
                            onClick={this.clearSearch}
                        >
                            Clear search
                        </button>
                    </AUpageAlert>
                );
            }
            return (
                <div>
                    {this.props.keyword &&
                        this.props.keyword.trim().length > 0 &&
                        this.props.keyword.trim() !== "*" && (
                            <div className="result-count">
                                {`Results matching "${this.props.keyword}" (${
                                    this.props.hitCount
                                })`}
                                <button
                                    className="clear-btn au-btn au-btn--tertiary"
                                    type="button"
                                    onClick={this.clearSearch}
                                >
                                    Clear search
                                </button>
                            </div>
                        )}
                    {this.props.publishers.map(p => (
                        <PublisherSummary publisher={p} key={p.identifier} />
                    ))}
                </div>
            );
        }
    }

    renderSearchBar(translate) {
        return (
            <div className="organization-search">
                <label htmlFor="organization-search" className="sr-only">
                    {translate("publishersSearchPlaceholder")}
                </label>
                <input
                    className="au-text-input au-text-input--block organization-search"
                    name="organization-search"
                    id="organization-search"
                    type="text"
                    value={this.state.inputText}
                    placeholder={translate("publishersSearchPlaceholder")}
                    onChange={this.onUpdateSearchText}
                    onKeyPress={this.handleSearchFieldEnterKeyPress}
                    ref={el => (this.searchInputFieldRef = el)}
                />
                <button
                    className="search-icon au-btn"
                    onClick={this.onClickSearch}
                >
                    <img src={search} alt="search" />
                </button>
            </div>
        );
    }

    render() {
        const currentPage =
            +queryString.parse(this.props.location.search).page || 1;

        return (
            <NamespacesConsumer ns={["publishersPage", "global"]}>
                {translate => (
                    <ReactDocumentTitle
                        title={`${translate(
                            "publishersBreadCrumb"
                        )} | Page ${currentPage} | ${translate(
                            "global:appName"
                        )}`}
                    >
                        <div className="publishers-viewer">
                            <Medium>
                                <Breadcrumbs
                                    breadcrumbs={[
                                        <li key="organisations">
                                            <span>
                                                {translate(
                                                    "publishersBreadCrumb"
                                                )}
                                            </span>
                                        </li>
                                    ]}
                                />
                            </Medium>

                            <div className="row">
                                <div className="publishers-viewer__header">
                                    <div className="col-sm-8">
                                        <h1>
                                            {translate("publishersPageTitle")}
                                        </h1>
                                    </div>

                                    <div className="col-sm-4">
                                        {this.renderSearchBar(translate)}
                                    </div>
                                </div>

                                <div className="col-sm-8 org-result-page-body">
                                    {this.props.isFetching ? (
                                        <ProgressBar />
                                    ) : (
                                        this.renderContent(translate)
                                    )}
                                </div>
                            </div>
                            {!this.props.isFetching &&
                                !this.props.error &&
                                this.props.hitCount > config.resultsPerPage && (
                                    <Pagination
                                        currentPage={currentPage}
                                        maxPage={Math.ceil(
                                            this.props.hitCount /
                                                config.resultsPerPage
                                        )}
                                        onPageChange={this.onPageChange}
                                        totalItems={this.props.hitCount}
                                    />
                                )}
                        </div>
                    </ReactDocumentTitle>
                )}
            </NamespacesConsumer>
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
    const keyword = state.publisher.keyword;
    return {
        publishers,
        isFetching,
        hitCount,
        error,
        keyword,
        strings: state.content.strings
    };
}

PublishersViewer.contextTypes = {
    router: PropTypes.object.isRequired
};

const PublishersViewerWithRouter = withRouter(props => (
    <PublishersViewer {...props} />
));

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(PublishersViewerWithRouter);
