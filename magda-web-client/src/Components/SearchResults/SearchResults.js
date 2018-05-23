import React, { Component } from "react";
import DatasetSummary from "../../Components/Dataset/DatasetSummary";
import "./SearchResults.css";
import SearchPageSuggest from "./SearchPageSuggest";
import { enableSuggestDatasetPage } from "../../config";

class SearchResults extends Component {
    getSummaryText() {
        if (this.props.searchResults.length) {
            if (this.props.strategy === "match-part") {
                return (
                    <div className="search-recomendations__count">
                        The following {this.props.totalNumberOfResults} datasets
                        match some but not all of your search criteria
                    </div>
                );
            }
        }
        return null;
    }

    render() {
        return (
            <div className="search-results">
                {this.getSummaryText()}
                <ul className="list--unstyled">
                    {this.props.searchResults.map(
                        (result, i) =>
                            //show the request dataset form only after the first result
                            enableSuggestDatasetPage && i === 0 ? (
                                <React.Fragment key={i}>
                                    <li className="search-results__result">
                                        <DatasetSummary
                                            dataset={result}
                                            searchText={this.props.searchText}
                                        />
                                    </li>
                                    <li
                                        key={i - 5}
                                        className="search-results__result"
                                    >
                                        <SearchPageSuggest />
                                    </li>
                                </React.Fragment>
                            ) : (
                                <li key={i} className="search-results__result">
                                    <DatasetSummary
                                        dataset={result}
                                        searchText={this.props.searchText}
                                    />
                                </li>
                            )
                    )}
                </ul>
            </div>
        );
    }
}

SearchResults.defaultProps = { searchResults: [] };

export default SearchResults;
