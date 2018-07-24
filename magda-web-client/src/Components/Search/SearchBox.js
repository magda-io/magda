import "./SearchBox.css";
import { connect } from "react-redux";
import { bindActionCreators } from "redux";
import propTypes from "prop-types";
import { config } from "../../config";
import debounce from "lodash.debounce";
import defined from "../../helpers/defined";
import React, { Component } from "react";
import { fetchRegionMapping } from "../../actions/regionMappingActions";
import searchLight from "../../assets/search-grey.svg";
import searchDark from "../../assets/search-purple.svg";
// eslint-disable-next-line
import PropTypes from "prop-types";
import queryString from "query-string";
import SearchSuggestionBox from "./SearchSuggestionBox";
import { Small, Medium } from "../../UI/Responsive";

class SearchBox extends Component {
    constructor(props) {
        super(props);
        const self: any = this;
        self.handleSearchFieldEnterKeyPress = this.handleSearchFieldEnterKeyPress.bind(
            this
        );
        self.updateQuery = this.updateQuery.bind(this);
        self.updateSearchText = this.updateSearchText.bind(this);
        self.onClickSearch = this.onClickSearch.bind(this);
        self.onSearchTextChange = this.onSearchTextChange.bind(this);
        self.getSearchBoxValue = this.getSearchBoxValue.bind(this);

        // it needs to be undefined here, so the default value should be from the url
        // once this value is set, the value should always be from the user input
        this.state = {
            searchText: undefined,
            width: 0,
            height: 0,
            isFocus: false
        };
        this.searchInputFieldRef = null;
    }

    debounceUpdateSearchQuery = debounce(this.updateSearchText, 3000);

    componentDidMount() {
        this.props.fetchRegionMapping();
        this.setState({
            searchText: this.props.location.search.q
        });
    }

    componentDidUpdate(prevProps) {
        // figure out where the component update is from
        // if it's not from home page or search page, but is leading to search page, then we need to update search text and initiate search
        if (
            prevProps.location.pathname &&
            prevProps.location.pathname !== ("/search" || "/") &&
            this.props.location.pathname === "/search"
        ) {
            this.setState({
                searchText: this.props.location.search.q
            });
        }
    }

    onSearchTextChange(event) {
        const text = event.target.value;
        this.setState({
            searchText: text
        });
        this.debounceUpdateSearchQuery(text);
    }

    /**
     * update only the search text, remove all facets
     */
    updateSearchText(text) {
        if (text === "") text = "*";
        // dismiss keyboard on mobile when new search initiates
        if (this.searchInputFieldRef) this.searchInputFieldRef.blur();
        this.updateQuery({
            q: text,
            page: undefined
        });
    }

    handleSearchFieldEnterKeyPress(event) {
        // when user hit enter, no need to submit the form
        if (event.charCode === 13) {
            event.preventDefault();
            this.debounceUpdateSearchQuery.flush();
        }
    }

    /**
     * If the search button is clicked, we do the search immediately
     */
    onClickSearch() {
        this.debounceUpdateSearchQuery.flush();
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

    render() {
        const input = (
            <input
                type="text"
                name="search"
                id="search"
                placeholder="Search for open data"
                value={this.getSearchBoxValue()}
                onChange={this.onSearchTextChange}
                onKeyPress={this.handleSearchFieldEnterKeyPress}
                autoComplete="off"
                ref={el => (this.searchInputFieldRef = el)}
                onFocus={() => this.setState({ isFocus: true })}
                onBlur={() =>
                    this.setState({
                        isFocus: false
                    })
                }
            />
        );

        const suggestionBox = (
            <SearchSuggestionBox
                searchText={this.getSearchBoxValue()}
                isSearchInputFocus={this.state.isFocus}
                inputRef={this.searchInputFieldRef}
            />
        );

        const icon = this.props.isHome ? searchDark : searchLight;
        return (
            <div className="searchBox">
                <label htmlFor="search">
                    <span className="sr-only">
                        {"Search " + config.appName}
                    </span>
                    <Medium>
                        <div style={{ position: "relative" }}>
                            {input}
                            {suggestionBox}
                        </div>
                    </Medium>
                    <Small>{input}</Small>
                    <span className="search-input__highlight">
                        {this.getSearchBoxValue()}
                    </span>
                    <button
                        onClick={this.onClickSearch}
                        className={`search-btn ${
                            this.getSearchBoxValue().length > 0
                                ? "not-empty"
                                : "empty"
                        }`}
                        type="button"
                    >
                        <img src={icon} alt="search button" />
                        <span className="sr-only">submit search</span>
                    </button>
                </label>

                <Small>{suggestionBox}</Small>
            </div>
        );
    }
}

SearchBox.contextTypes = {
    router: propTypes.object.isRequired
};

const mapStateToProps = (state, ownProps) => {
    let { datasetSearch } = state;
    return {
        freeText: datasetSearch.freeText
    };
};

const mapDispatchToProps = dispatch =>
    bindActionCreators(
        {
            fetchRegionMapping: fetchRegionMapping
        },
        dispatch
    );

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(SearchBox);
