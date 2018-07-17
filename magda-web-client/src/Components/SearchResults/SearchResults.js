import React, { Component } from "react";
import DatasetSummary from "../../Components/Dataset/DatasetSummary";
import "./SearchResults.css";
import SearchPageSuggest from "./SearchPageSuggest";
import { enableSuggestDatasetPage } from "../../config";

class SearchResults extends Component {
    render() {
        return (
            <div className="search-results">
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
                                            searchResultNumber={i}
                                        />
                                    </li>
                                    <li
                                        key={i - 5}
                                        className="search-results__result correspondence-dropdown-search"
                                    >
                                        <SearchPageSuggest />
                                    </li>
                                </React.Fragment>
                            ) : (
                                <li key={i} className="search-results__result">
                                    <DatasetSummary
                                        dataset={result}
                                        searchText={this.props.searchText}
                                        searchResultNumber={i}
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
