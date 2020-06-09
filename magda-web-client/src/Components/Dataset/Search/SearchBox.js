import "./SearchBox.scss";
import { connect } from "react-redux";
import { bindActionCreators } from "redux";
import propTypes from "prop-types";
import debounce from "lodash/debounce";
import defined from "helpers/defined";
import React, { Component } from "react";
import { fetchRegionMapping } from "actions/regionMappingActions";
import searchLight from "assets/search-grey.svg";
import searchDark from "assets/search-purple.svg";
// eslint-disable-next-line
import PropTypes from "prop-types";
import queryString from "query-string";
import SearchSuggestionBox from "./SearchSuggestionBox";
import { Small } from "Components/Common/Responsive";
import stripFiltersFromQuery from "./stripFiltersFromQuery";
import { withRouter } from "react-router-dom";
import MagdaNamespacesConsumer from "Components/i18n/MagdaNamespacesConsumer";

class SearchBox extends Component {
    constructor(props) {
        super(props);
        const self = this;
        self.handleSearchFieldEnterKeyPress = this.handleSearchFieldEnterKeyPress.bind(
            this
        );
        self.updateQuery = this.updateQuery.bind(this);
        self.updateSearchText = this.updateSearchText.bind(this);
        self.onClickSearch = this.doSearchNow.bind(this);
        self.onSearchTextChange = this.onSearchTextChange.bind(this);
        self.getSearchBoxValue = this.getSearchBoxValue.bind(this);

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
        props.history.listen((location) => {
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

        if (text === "") {
            if (fromTextChange) {
                return;
            } else {
                text = "*";
            }
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

    handleSearchFieldEnterKeyPress(event, keepFilters) {
        // when user hit enter, no need to submit the form
        if (event.charCode === 13) {
            event.preventDefault();
            this.debounceUpdateSearchQuery.flush(
                this.getSearchBoxValue(),
                keepFilters
            );
        }
    }

    /**
     * If the search button is clicked, we do the search immediately
     */
    doSearchNow(keepFilters) {
        this.debounceUpdateSearchQuery.cancel();
        this.updateSearchText(this.state.searchText, true);
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
                placeholder="Search for open data"
                value={this.getSearchBoxValue()}
                onChange={(e) => this.onSearchTextChange(e, keepFilters)}
                onKeyPress={(e) =>
                    this.handleSearchFieldEnterKeyPress(e, keepFilters)
                }
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

        const icon = this.props.isHome ? searchDark : searchLight;
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
                                        onClick={() =>
                                            this.doSearchNow(!isSmall)
                                        }
                                        className={`search-btn ${
                                            this.getSearchBoxValue().length > 0
                                                ? "not-empty"
                                                : "empty"
                                        }`}
                                        type="button"
                                    >
                                        <img src={icon} alt="search button" />
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
