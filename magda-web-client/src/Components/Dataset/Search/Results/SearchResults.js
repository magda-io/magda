import React, { Component } from "react";
import DatasetSummary from "./DatasetSummary";
import "./SearchResults.scss";
import SearchPageSuggest from "./SearchPageSuggest";
import { needsContent } from "helpers/content";

function SuggestionBox() {
    return (
        <li
            key="suggestion-box"
            className="search-results__result correspondence-dropdown-search"
        >
            <SearchPageSuggest />
        </li>
    );
}

class SearchResults extends Component {
    getSuggestionBoxIndex = () => {
        if (this.props.suggestionBoxAtEnd && this.props.isFirstPage) {
            return this.props.configuration.searchResultsPerPage;
        }

        const scores = this.props.searchResults.map((result) => result.score);

        for (let i = 0; i < scores.length; i++) {
            if (
                scores[i] <
                this.props.configuration.datasetSearchSuggestionScoreThreshold
            ) {
                return i;
            }
        }

        return -1;
    };

    render() {
        const suggestionBoxIndex = this.props.configuration
            .datasetSearchSuggestionScoreThreshold
            ? this.getSuggestionBoxIndex()
            : -1;

        // The searchResults will usually pass us one more search result than we actually want to display, so we know
        // whether to put the suggest box at the end.
        const shownSearchResults = this.props.searchResults.slice(
            0,
            this.props.configuration.searchResultsPerPage
        );

        return (
            <div className="search-results">
                <ul className="list--unstyled">
                    {/* Only show the suggestion box before the first result if we're on the first page - if we're not
                    on the first page then presumably it was already shown as the last result on the previous page */}
                    {suggestionBoxIndex === 0 && this.props.isFirstPage && (
                        <SuggestionBox />
                    )}

                    {shownSearchResults.map((result, i) => (
                        //show the request dataset form only after the first result
                        <React.Fragment key={i}>
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

                            {i + 1 === suggestionBoxIndex && <SuggestionBox />}
                        </React.Fragment>
                    ))}
                </ul>
            </div>
        );
    }
}

SearchResults.defaultProps = { searchResults: [] };

export default needsContent("configuration")(SearchResults);
