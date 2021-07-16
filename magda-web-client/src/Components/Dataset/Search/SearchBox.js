import "./SearchBox.scss";
import { connect } from "react-redux";
import { bindActionCreators } from "redux";
import propTypes from "prop-types";
import debounce from "lodash/debounce";
import defined from "helpers/defined";
import React, { Component } from "react";
import { fetchRegionMapping } from "actions/regionMappingActions";
import { ReactComponent as SearchIcon } from "assets/search-grey.svg";
import queryString from "query-string";
import SearchSuggestionBox from "./SearchSuggestionBox";
import { Small } from "Components/Common/Responsive";
import stripFiltersFromQuery from "./stripFiltersFromQuery";
import { withRouter } from "react-router-dom";
import MagdaNamespacesConsumer from "Components/i18n/MagdaNamespacesConsumer";

class SearchBox extends Component {
    constructor(props) {
        super(props);
        this.handleSearchFieldEnterKeyPress = this.handleSearchFieldEnterKeyPress.bind(
            this
        );
        this.updateQuery = this.updateQuery.bind(this);
        this.updateSearchText = this.updateSearchText.bind(this);
        this.onClickSearch = this.doSearchNow.bind(this);
        this.onSearchTextChange = this.onSearchTextChange.bind(this);
        this.getSearchBoxValue = this.getSearchBoxValue.bind(this);

        // it needs to be undefined here, so the default value should be from the url
        // once this value is set, the value should always be from the user input
        this.state = {
            searchText: null,
            width: 0,
            height: 0,
            isFocus: false,
            selectedId: null
        };
        this.searchInputFieldRef = null;
        props.history.listen(() => {
            this.debounceUpdateSearchQuery.cancel();
            this.setState({
                searchText: null
            });
        });
    }

    debounceUpdateSearchQuery = debounce(this.updateSearchText, 3000);

    componentDidMount() {
        this.props.fetchRegionMapping();
    }

    onSearchTextChange(event, keepFilters) {
        const text = event.target.value;
        this.setState({
            searchText: text
        });
        this.debounceUpdateSearchQuery(text, keepFilters, true);
    }

    /**
     * update only the search text
     */
    updateSearchText(text, keepFilters, fromTextChange = false) {
        if (fromTextChange && this.state.selectedId) {
            return;
        }

        if (typeof text === "string") {
            text = text.trim();
        }
        // dismiss keyboard on mobile when new search initiates
        if (this.searchInputFieldRef) this.searchInputFieldRef.blur();

        const query = {
            q: text,
            page: undefined
        };

        this.updateQuery(keepFilters ? query : stripFiltersFromQuery(query));
        this.setState({
            searchText: null
        });
    }

    handleSearchFieldEnterKeyPress(event) {
        // when user hit enter, no need to submit the form
        if (event.charCode === 13) {
            event.preventDefault();
            this.debounceUpdateSearchQuery.cancel();
            this.updateSearchText(this.getSearchBoxValue(), true);
        }
    }

    /**
     * If the search button is clicked, we do the search immediately
     */
    doSearchNow() {
        this.debounceUpdateSearchQuery.cancel();
        this.updateSearchText(this.getSearchBoxValue(), true);
    }

    /**
     * query in this case, is one or more of the params
     * eg: {'q': 'water'}
     */
    updateQuery(query) {
        this.context.router.history.push({
            pathname: "/search",
            search: queryString.stringify(
                Object.assign(
                    queryString.parse(this.props.location.search),
                    query
                )
            )
        });
    }

    /**
     * This calculate the value to show in the search box
     */
    getSearchBoxValue() {
        if (defined(this.state.searchText)) {
            return this.state.searchText;
        } else if (defined(queryString.parse(this.props.location.search).q)) {
            return queryString.parse(this.props.location.search).q;
        }
        return "";
    }

    onDismissError() {
        // remove all current configurations
        this.updateSearchText("");
    }

    inputBox(keepFilters) {
        return (
            <input
                type="text"
                name="search"
                id="search"
                placeholder="Search for data"
                value={this.getSearchBoxValue()}
                onChange={(e) => this.onSearchTextChange(e, keepFilters)}
                onKeyPress={(e) => this.handleSearchFieldEnterKeyPress(e)}
                autoComplete="off"
                ref={(el) => (this.searchInputFieldRef = el)}
                onFocus={() => this.setState({ isFocus: true })}
                onBlur={() =>
                    this.setState({
                        isFocus: false
                    })
                }
                role="combobox"
                aria-autocomplete="list"
                aria-owns="search-history-items"
                aria-activedescendant={this.state.selectedId}
                aria-expanded={this.state.isFocus}
                aria-controls="search-suggestion-box"
            />
        );
    }

    onSelectedIdChange = (newId) => {
        this.setState({
            selectedId: newId
        });
    };

    render() {
        const suggestionBox = (
            <SearchSuggestionBox
                searchText={this.getSearchBoxValue()}
                isSearchInputFocus={this.state.isFocus}
                inputRef={this.searchInputFieldRef}
                onSelectedIdChange={this.onSelectedIdChange}
            />
        );

        return (
            <MagdaNamespacesConsumer ns={["global"]}>
                {(translate) => (
                    <Small>
                        {(isSmall) => (
                            <div className="searchBox">
                                <label htmlFor="search">
                                    <span className="sr-only">
                                        {"Search " +
                                            translate(["appName", ""]) +
                                            ", use arrow keys to browse search history"}
                                    </span>
                                    {isSmall ? (
                                        this.inputBox(false)
                                    ) : (
                                        <div style={{ position: "relative" }}>
                                            {this.inputBox(true)}
                                            {suggestionBox}
                                        </div>
                                    )}
                                    <span className="search-input__highlight">
                                        {this.getSearchBoxValue()}
                                    </span>
                                    <button
                                        onClick={this.doSearchNow.bind(this)}
                                        className={`search-btn ${
                                            this.getSearchBoxValue().length > 0
                                                ? "not-empty"
                                                : "empty"
                                        }`}
                                        type="button"
                                    >
                                        <SearchIcon aria-label="search button" />
                                        <span className="sr-only">
                                            submit search
                                        </span>
                                    </button>
                                </label>

                                {isSmall && suggestionBox}
                            </div>
                        )}
                    </Small>
                )}
            </MagdaNamespacesConsumer>
        );
    }
}

SearchBox.contextTypes = {
    router: propTypes.object.isRequired
};

const mapStateToProps = (state, ownProps) => {
    let { datasetSearch } = state;
    return {
        freeText: datasetSearch.freeText,
        strings: state.content.strings
    };
};

const mapDispatchToProps = (dispatch) =>
    bindActionCreators(
        {
            fetchRegionMapping: fetchRegionMapping
        },
        dispatch
    );

const SearchBoxWithRouter = withRouter((props) => <SearchBox {...props} />);

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(SearchBoxWithRouter);
