import React, { Component } from "react";
import DatasetSummary from "../../Components/Dataset/DatasetSummary";
import "./SearchResults.css";
import SearchPageSuggest from "./SearchPageSuggest";
import { config } from "../../config";

const { datasetSearchSuggestionScoreThreshold } = config;
class SearchResults extends Component {
    getSuggestionBoxIndex = () => {
        const scores = this.props.searchResults.map(result => result.score);

        for (let i = 0; i < scores.length; i++) {
            if (scores[i] < datasetSearchSuggestionScoreThreshold) {
                return i;
            }
        }

        return -1;
    };

    render() {
        const suggestionBoxIndex = datasetSearchSuggestionScoreThreshold
            ? this.getSuggestionBoxIndex()
            : -1;

        return (
            <div className="search-results">
                <ul className="list--unstyled">
                    {this.props.searchResults.map((result, i) => (
                        //show the request dataset form only after the first result
                        <React.Fragment key={i}>
                            {i === suggestionBoxIndex && (
                                <li
                                    key="suggestion-box"
                                    className="search-results__result correspondence-dropdown-search"
                                >
                                    <SearchPageSuggest />
                                </li>
                            )}

                            <li
                                key={`result-${i}`}
                                className="search-results__result"
                            >
                                <DatasetSummary
                                    dataset={result}
                                    searchText={this.props.searchText}
                                    searchResultNumber={i}
                                />
                            </li>
                        </React.Fragment>
                    ))}
                </ul>
            </div>
        );
    }
}

SearchResults.defaultProps = { searchResults: [] };

export default SearchResults;
