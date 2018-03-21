import React, { Component } from "react";
import { connect } from "react-redux";
import { withRouter } from "react-router-dom";
import PropTypes from "prop-types";
import isEqual from "lodash.isequal";
import queryString from "query-string";
import getDateString from "../../helpers/getDateString";
import MarkdownViewer from "../../UI/MarkdownViewer";
import "./SearchSuggestionBox.css";

type searchDataType = {
    name: ?string,
    regionName: ?string,
    data: object
};

/**
 * when no user input, the first `maxDefaultListItemNumber` items will be returned
 */
const maxDefaultListItemNumber = 5;

/**
 * Max no.of items will be saved locally
 */
const maxSavedItemNumber = 5;

class SearchSuggestionBox extends Component {
    constructor(props) {
        super(props);
        this.state = {
            isMouseOver: false,
            recentSearches: this.retrieveLocalData("recentSearches")
        };
        this.createSearchDataFromProps(this.props);
    }

    retrieveLocalData(key): searchDataType {
        if (!window.localStorage) return [];
        if (!key || typeof key !== "string")
            throw new Error("Invalid key parameter!");
        try {
            const items = JSON.parse(window.localStorage.getItem(key));
            if (!items || typeof items !== "object" || !items.length) return [];
            return items;
        } catch (e) {
            console.log(
                `Failed to retrieve search save data '${key}' from local storage: ${
                    e.message
                }`
            );
            return [];
        }
    }

    insertItemIntoLocalData(
        key,
        searchData: searchDataType,
        limit = maxSavedItemNumber
    ) {
        if (!window.localStorage) return [];
        let items = this.retrieveLocalData(key);
        items = items.filter(item => {
            return !isEqual(item.data, searchData.data);
        });
        items.unshift(searchData);
        if (limit && limit >= 1) items = items.slice(0, limit);
        try {
            window.localStorage.setItem(key, JSON.stringify(items));
            return items;
        } catch (e) {
            console.log(
                `Failed to save search save data '${key}' to local storage: ${
                    e.message
                }`
            );
            return [];
        }
    }

    createSearchDataFromProps(props): searchDataType {
        if (!props.location || !props.location.search) return null;
        const data = queryString.parse(props.location.search);
        if (!Object.keys(data).length) return null;
        const searchData = { data };
        if (data.regionId) {
            if (
                props.datasetSearch &&
                props.datasetSearch.activeRegion &&
                props.datasetSearch.activeRegion.regionName
            )
                searchData["regionName"] =
                    props.datasetSearch.activeRegion.regionName;
            else return null; //--- Only save searches when region name is available
        }
        return searchData;
    }

    createSearchOptionListTextFromArray(arr, lastSeparator = "or") {
        if (!arr) return null;
        if (typeof arr === "string") return `*${arr}*`;
        if (!arr.length) return null;
        const formatedItems = arr.map((item, idx) => `*${item}*`);
        if (formatedItems.length <= 1) return formatedItems[0];
        const lastItem = formatedItems.pop();
        let resultStr = formatedItems.join(", ");
        resultStr = `${resultStr} ${lastSeparator} ${lastItem}`;
        return resultStr;
    }

    createSearchItemLabelText(searchData: searchDataType) {
        const data = searchData.data;
        const filters = [];
        if (data.regionId) filters.push(`in *${searchData.regionName}*`);
        if (data.format && data.format.length)
            filters.push(
                "in " +
                    this.createSearchOptionListTextFromArray(data.format) +
                    " format"
            );
        if (data.publisher)
            filters.push(
                "from publisher " +
                    this.createSearchOptionListTextFromArray(data.publisher)
            );
        if (data.dateFrom)
            filters.push("from *" + getDateString(data.dateFrom) + "*");
        if (data.dateFrom)
            filters.push("to *" + getDateString(data.dateFrom) + "*");
        const qStr = data.q ? data.q.trim() : "";
        return qStr ? qStr + " " + filters.join("; ") : filters.join("; ");
    }

    saveRecentSearch(newProps) {
        const searchData = this.createSearchDataFromProps(newProps);
        if (!searchData) return;
        const recentSearches = this.insertItemIntoLocalData(
            "recentSearches",
            searchData
        );

        this.setState({ recentSearches });
    }

    componentWillReceiveProps(newProps) {
        this.saveRecentSearch(newProps);
    }

    onSearchItemClick(e, item: searchDataType) {
        e.preventDefault();
        const qStr = queryString.stringify(item.data);
        this.props.history.push(`./search?${qStr}`);
        this.setState({
            isMouseOver: false
        });
    }

    onMouseOver() {
        this.setState({
            isMouseOver: true
        });
    }

    onMouseOut() {
        this.setState({
            isMouseOver: false
        });
    }

    getFilteredResult() {
        const recentSearches = this.state.recentSearches;
        if (!recentSearches || !recentSearches.length) return [];

        if (!this.props.searchText)
            return recentSearches.slice(0, maxDefaultListItemNumber);
        const inputText = this.props.searchText.trim().toLowerCase();
        if (!inputText)
            return recentSearches.slice(0, maxDefaultListItemNumber);

        const filteredRecentSearches = recentSearches.filter(item => {
            if (
                item.data.q &&
                item.data.q.toLowerCase().indexOf(inputText) !== -1
            )
                return true;
            return false;
        });

        return filteredRecentSearches;
    }

    render() {
        if (!this.props.isSearchInputFocus && !this.state.isMouseOver)
            return null;
        const filteredRecentSearches = this.state.recentSearches; //--- disabled the filter function for now
        if (!filteredRecentSearches || !filteredRecentSearches.length)
            return null;

        return (
            <div className="search-suggestion-box">
                <div className="search-suggestion-box-position-adjust" />
                <div
                    className="search-suggestion-box-body"
                    onMouseOver={() => this.onMouseOver()}
                    onMouseOut={() => this.onMouseOut()}
                >
                    <h5>Recent Searches</h5>
                    {filteredRecentSearches.map((item, idx) => (
                        <button
                            key={idx}
                            className="mui-btn mui-btn--flat"
                            onClick={e => this.onSearchItemClick(e, item)}
                        >
                            <MarkdownViewer
                                markdown={this.createSearchItemLabelText(item)}
                                truncate={false}
                            />
                        </button>
                    ))}
                </div>
            </div>
        );
    }
}

SearchSuggestionBox.PropTypes = {
    searchText: PropTypes.string
};

SearchSuggestionBox.defaultProps = {
    searchText: null
};

const SearchSuggestionBoxWithRouter = withRouter(
    ({ history, location, datasetSearch, searchText, isSearchInputFocus }) => (
        <SearchSuggestionBox
            history={history}
            location={location}
            datasetSearch={datasetSearch}
            searchText={searchText}
            isSearchInputFocus={isSearchInputFocus}
        />
    )
);

const mapStateToProps = state => {
    return {
        datasetSearch: state.datasetSearch
    };
};

export default connect(mapStateToProps)(SearchSuggestionBoxWithRouter);
