import "./DatasetsSearchPage.scss";
import { connect } from "react-redux";
import { Redirect } from "react-router-dom";
import defined from "helpers/defined";
import Pagination from "Components/Common/Pagination";
import Notification from "Components/Common/Notification";
import MagdaDocumentTitle from "Components/i18n/MagdaDocumentTitle";
import React, { Component } from "react";
import SearchFacets from "Components/Dataset/Search/Facets/SearchFacets";
import SearchResults from "Components/Dataset/Search/Results/SearchResults";
import MatchingStatus from "./Search/Results/MatchingStatus";
import { bindActionCreators } from "redux";
import {
    fetchSearchResultsIfNeeded,
    resetDatasetSearch
} from "actions/datasetSearchActions";
import queryString from "query-string";
import ProgressBar from "Components/Common/ProgressBar";
import stripFiltersFromQuery from "./Search/stripFiltersFromQuery";
import PropTypes from "prop-types";
import { withRouter, RouteComponentProps } from "react-router-dom";

interface Props extends RouteComponentProps {
    publishingState: string;
}

class Search extends Component<Props & any> {
    static contextTypes = {
        router: PropTypes.object
    };

    state: {
        searchText?: string;
    };

    constructor(props) {
        super(props);
        const self: any = this;

        self.onClickTag = this.onClickTag.bind(this);
        self.updateQuery = this.updateQuery.bind(this);
        self.onDismissError = this.onDismissError.bind(this);
        self.updateSearchText = this.updateSearchText.bind(this);
        self.onToggleDataset = this.onToggleDataset.bind(this);
        // it needs to be undefined here, so the default value should be from the url
        // once this value is set, the value should always be from the user input
        this.state = {
            searchText: undefined
        };
    }

    componentDidMount() {
        const query = queryString.parse(this.props.location.search);
        if (
            this.props.publishingState &&
            this.props.publishingState.trim() !== ""
        ) {
            query["publishingState"] = this.props.publishingState;
        }
        this.props.resetDatasetSearch();
        this.props.fetchSearchResultsIfNeeded(query);
    }

    componentDidUpdate() {
        const query = queryString.parse(this.props.location.search);
        if (
            this.props.publishingState &&
            this.props.publishingState.trim() !== ""
        ) {
            query["publishingState"] = this.props.publishingState;
        }
        this.props.fetchSearchResultsIfNeeded(query);
    }

    componentWillUnmount() {
        this.props.resetDatasetSearch();
    }

    onClickTag(tag: string) {
        this.setState({
            searchText: tag
        });
        this.updateSearchText(tag);
    }

    /**
     * update only the search text, remove all facets
     */
    updateSearchText(text: string) {
        this.updateQuery(
            stripFiltersFromQuery({
                q: text
            })
        );
    }

    /**
     * query in this case, is one or more of the params
     * eg: {'q': 'water'}
     */
    updateQuery(query) {
        this.props.history.push({
            pathname: this.props.location.pathname,
            search: queryString.stringify(
                Object.assign(
                    queryString.parse(this.props.location.search),
                    query
                )
            )
        });
    }

    onDismissError() {
        // remove all current configurations
        this.updateSearchText("");
        this.props.resetDatasetSearch();
    }

    onToggleDataset(datasetIdentifier) {
        this.updateQuery({
            open:
                datasetIdentifier ===
                queryString.parse(this.props.location.search).open
                    ? ""
                    : datasetIdentifier
        });
    }

    searchBoxEmpty() {
        return (
            !defined(queryString.parse(this.props.location.search).q) ||
            queryString.parse(this.props.location.search).q.length === 0
        );
    }

    /**
     * counts the number of filters that have active values
     * this is then appended to the results text on the search page
     */
    filterCount = () => {
        let count = 0;
        if (this.props.activePublishers.length > 0) {
            count++;
        }
        if (this.props.activeFormats.length > 0) {
            count++;
        }

        if (this.props.activeRegion.regionId) {
            count++;
        }

        if (this.props.activeDateFrom || this.props.activeDateTo) {
            count++;
        }
        if (count !== 0) {
            const filterText = count === 1 ? " filter" : " filters";
            return " with " + count + filterText;
        } else {
            return "";
        }
    };

    render() {
        const searchText =
            queryString.parse(this.props.location.search).q || "";
        const currentPage =
            +queryString.parse(this.props.location.search).page || 1;
        const isBlankSearch = searchText === "*" || searchText === "";
        const searchResultsPerPage = this.props.configuration
            .searchResultsPerPage;

        const publishingState = this.props.publishingState
            ? this.props.publishingState.trim()
            : "";
        let resultTitle = "";
        if (publishingState === "" || publishingState === "*") {
            resultTitle = "all datasets ";
        } else if (publishingState !== "published") {
            resultTitle = `${publishingState} datasets `;
        }

        return (
            <MagdaDocumentTitle
                prefixes={[
                    `Datasets search: ${searchText}`,
                    `Page ${currentPage}`
                ]}
            >
                <div>
                    {this.props.isFetching && <ProgressBar />}
                    <div className="search">
                        <div className="search__search-body">
                            <SearchFacets
                                updateQuery={this.updateQuery}
                                location={this.props.location}
                            />
                            {!this.props.isFetching && !this.props.error && (
                                <div className="sub-heading">
                                    {" "}
                                    {resultTitle}
                                    results {this.filterCount()} (
                                    {this.props.hitCount})
                                </div>
                            )}
                            {!this.props.isFetching && !this.props.error && (
                                <div>
                                    <MatchingStatus
                                        datasets={this.props.datasets}
                                        strategy={this.props.strategy}
                                    />

                                    {
                                        // redirect if we came from a 404 error and there is only one result
                                        queryString.parse(
                                            this.props.location.search
                                        ).notfound &&
                                            this.props.datasets.length ===
                                                1 && (
                                                <Redirect
                                                    to={`/dataset/${encodeURI(
                                                        this.props.datasets[0]
                                                            .identifier
                                                    )}/details`}
                                                />
                                            )
                                    }
                                    <SearchResults
                                        strategy={this.props.strategy}
                                        searchResults={this.props.datasets}
                                        onClickTag={this.onClickTag}
                                        onToggleDataset={this.onToggleDataset}
                                        openDataset={
                                            queryString.parse(
                                                this.props.location.search
                                            ).open
                                        }
                                        searchText={searchText}
                                        isFirstPage={currentPage === 1}
                                        suggestionBoxAtEnd={isBlankSearch}
                                    />
                                    {this.props.hitCount >
                                        searchResultsPerPage && (
                                        <Pagination
                                            currentPage={currentPage}
                                            maxPage={Math.ceil(
                                                this.props.hitCount /
                                                    searchResultsPerPage
                                            )}
                                            location={this.props.location}
                                            totalItems={this.props.hitCount}
                                        />
                                    )}
                                </div>
                            )}
                            {!this.props.isFetching && this.props.error && (
                                <Notification
                                    content={this.props.error}
                                    type="error"
                                    onDismiss={this.onDismissError}
                                />
                            )}
                        </div>
                    </div>
                </div>
            </MagdaDocumentTitle>
        );
    }
}

const mapDispatchToProps = (dispatch) =>
    bindActionCreators(
        {
            fetchSearchResultsIfNeeded: fetchSearchResultsIfNeeded,
            resetDatasetSearch: resetDatasetSearch
        },
        dispatch
    );

function mapStateToProps(state, ownProps) {
    let { datasetSearch } = state;
    return {
        datasets: datasetSearch.datasets,
        activeFormats: datasetSearch.activeFormats,
        activePublishers: datasetSearch.activePublishers,
        activeRegion: datasetSearch.activeRegion,
        activeDateFrom: datasetSearch.activeDateFrom,
        activeDateTo: datasetSearch.activeDateTo,
        hitCount: datasetSearch.hitCount,
        isFetching: datasetSearch.isFetching,
        strategy: datasetSearch.strategy,
        error: datasetSearch.error,
        freeText: datasetSearch.freeText,
        strings: state.content.strings,
        configuration: state.content.configuration
    };
}

export default withRouter(connect(mapStateToProps, mapDispatchToProps)(Search));
