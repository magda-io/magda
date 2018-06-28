import React, { Component } from "react";
import { connect } from "react-redux";
import { withRouter } from "react-router-dom";
import PropTypes from "prop-types";
import queryString from "query-string";
import getDateString from "../../helpers/getDateString";
import MarkdownViewer from "../../UI/MarkdownViewer";
import { Small, Medium } from "../../UI/Responsive";
import "./SearchSuggestionBox.css";
import recentSearchIcon from "../../assets/updated.svg";
import closeIcon from "../../assets/mobile-menu-close.svg";
import isEqual from "lodash.isequal";

type searchDataType = {
    name: ?string,
    regionName: ?string,
    data: object
};

const keyCodeArrowDown = 40;
const keyCodeArrowUp = 38;
const keyCodeEnter = 13;

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
            recentSearches: this.retrieveLocalData("recentSearches"),
            selectedItemIdx: null
        };
        this.cacheImgs();
        this.createSearchDataFromProps(this.props);
        this.searchInputRef = null;
        this.onSearchInputKeyDown = this.onSearchInputKeyDown.bind(this);
        this.containerRef = null;
    }

    cacheImgs() {
        const cacheImg = img => {
            const imgLoader = new Image();
            imgLoader.src = img;
            this.cacheImages.push(imgLoader);
        };

        this.cacheImages = [];
        cacheImg(recentSearchIcon);
        cacheImg(closeIcon);
    }

    retrieveLocalData(key): searchDataType {
        try {
            if (!("localStorage" in window) || !window.localStorage) return [];
        } catch (e) {
            /// http://crocodillon.com/blog/always-catch-localstorage-security-and-quota-exceeded-errors
            return [];
        }
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
        items = items.filter(item => item.data.q !== searchData.data.q);
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

    deleteItemFromLocalData(key, idx) {
        if (!window.localStorage) return [];
        let items = this.retrieveLocalData(key);
        items.splice(idx, 1);
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
        if (!props || !props.location || !props.location.search) return null;
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
        if (data.organisation)
            filters.push(
                "from organisation " +
                    this.createSearchOptionListTextFromArray(data.publisher)
            );
        if (data.dateFrom)
            filters.push("from *" + getDateString(data.dateFrom) + "*");
        if (data.dateFrom)
            filters.push("to *" + getDateString(data.dateFrom) + "*");
        let qStr = data.q ? data.q.trim() : "";
        if (qStr === "*") qStr = "\\*";
        return qStr ? qStr + " " + filters.join("; ") : filters.join("; ");
    }

    saveRecentSearch(newProps, prevProps) {
        const searchData = this.createSearchDataFromProps(newProps);
        if (!searchData) return;
        if (
            !searchData.data.q ||
            !searchData.data.q.trim() ||
            searchData.data.q.trim() === "*"
        )
            return;
        const currentSearchData = this.createSearchDataFromProps(prevProps);
        if (isEqual(currentSearchData, searchData)) return;
        const recentSearches = this.insertItemIntoLocalData(
            "recentSearches",
            searchData
        );
        this.setState({ recentSearches });
    }

    componentDidUpdate(prevProps) {
        this.saveRecentSearch(this.props, prevProps);
        this.setupSearchInputListener(this.props);
    }

    executeSearchItem(item: searchDataType) {
        const searchData = { ...item.data };
        if (searchData.publisher) delete searchData.publisher;
        const qStr = queryString.stringify(searchData);
        this.props.history.push(`/search?${qStr}`);
        this.setState({
            isMouseOver: false,
            selectedItemIdx: null
        });
        this.searchInputRef.blur();
    }

    onSearchItemClick(e, item: searchDataType) {
        e.preventDefault();
        this.executeSearchItem(item);
    }

    onDeleteItemClick(e, idx) {
        e.preventDefault();
        const recentSearches = this.deleteItemFromLocalData(
            "recentSearches",
            idx
        );
        this.setState({ recentSearches });
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

    shouldShow() {
        if (!this.props.isSearchInputFocus && !this.state.isMouseOver)
            return false;
        const filteredRecentSearches = this.state.recentSearches;
        if (!filteredRecentSearches || !filteredRecentSearches.length)
            return false;
        return true;
    }

    setupSearchInputListener(newProps) {
        if (!newProps || !newProps.inputRef) return;
        const newInputRef = newProps.inputRef;
        if (this.searchInputRef) {
            if (this.searchInputRef === newInputRef) return;
            this.searchInputRef.removeEventListener(
                "keydown",
                this.onSearchInputKeyDown
            );
            this.searchInputRef = null;
        }
        this.searchInputRef = newInputRef;
        this.searchInputRef.addEventListener(
            "keydown",
            this.onSearchInputKeyDown
        );
    }

    onSearchInputKeyDown(e) {
        const keyCode = e.which || e.keyCode || 0;
        if (
            keyCode !== keyCodeArrowDown &&
            keyCode !== keyCodeArrowUp &&
            keyCode !== keyCodeEnter
        )
            return;
        if (!this.shouldShow()) return;
        if (keyCode === keyCodeEnter && this.state.selectedItemIdx !== null) {
            e.preventDefault();
            e.stopImmediatePropagation();
            this.executeSearchItem(
                this.state.recentSearches[this.state.selectedItemIdx]
            );
            return;
        }
        if (keyCode === keyCodeArrowUp && this.state.selectedItemIdx !== null)
            e.preventDefault(); //--- stop cursor from moving to the beginning of the input text
        if (keyCode === keyCodeArrowDown) this.selectNextItem();
        else this.selectPrevItem();
    }

    selectNextItem() {
        const maxNumber = this.getSavedSearchItemsNumber();
        if (!maxNumber) return;
        let newIdx;
        if (this.state.selectedItemIdx === null) newIdx = 0;
        else newIdx = (this.state.selectedItemIdx + 1) % maxNumber;
        this.setState({
            selectedItemIdx: newIdx
        });
    }

    selectPrevItem() {
        if (this.state.selectedItemIdx === null) return;
        let newIdx = this.state.selectedItemIdx - 1;
        if (newIdx < 0) newIdx = null;
        this.setState({
            selectedItemIdx: newIdx
        });
    }

    getSavedSearchItemsNumber() {
        const recentSearchItems = this.state.recentSearches;
        if (!recentSearchItems) return 0;
        return recentSearchItems.length;
    }

    render() {
        if (!this.shouldShow()) return null;
        const recentSearchItems = this.state.recentSearches;
        return (
            <div
                className="search-suggestion-box"
                ref={el => (this.containerRef = el)}
                tabIndex={999}
            >
                <div className="search-suggestion-box-position-adjust" />
                <div
                    className="search-suggestion-box-body"
                    onMouseOver={() => this.onMouseOver()}
                    onMouseOut={() => this.onMouseOut()}
                >
                    <Medium>
                        <h5 className="search-suggestion__heading">
                            Recent Searches
                        </h5>
                    </Medium>
                    {recentSearchItems.map((item, idx) => (
                        <div
                            key={idx}
                            className={`search-item-container ${
                                this.state.selectedItemIdx === idx
                                    ? "selected"
                                    : ""
                            }`}
                        >
                            <img
                                className="recent-item-icon"
                                src={recentSearchIcon}
                                alt="recent search item"
                            />
                            <button
                                className="au-btn au-btn--tertiary search-item-main-button"
                                onClick={e => this.onSearchItemClick(e, item)}
                            >
                                <Medium>
                                    <MarkdownViewer
                                        markdown={this.createSearchItemLabelText(
                                            item
                                        )}
                                        truncate={false}
                                    />
                                </Medium>
                                <Small>
                                    <div className="recent-item-content">
                                        {item.data.q ? item.data.q.trim() : ""}
                                    </div>
                                </Small>
                            </button>
                            <button
                                className="au-btn au-btn--tertiary search-item-delete-button"
                                onClick={e => this.onDeleteItemClick(e, idx)}
                            >
                                <img alt="delete search item" src={closeIcon} />
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        );
    }
}

SearchSuggestionBox.propTypes = {
    searchText: PropTypes.string,
    inputRef: PropTypes.object,
    isSearchInputFocus: PropTypes.bool,
    history: PropTypes.object,
    location: PropTypes.object,
    datasetSearch: PropTypes.object
};

SearchSuggestionBox.defaultProps = {
    searchText: null
};

const SearchSuggestionBoxWithRouter = withRouter(
    ({
        history,
        location,
        datasetSearch,
        searchText,
        isSearchInputFocus,
        inputRef
    }) => (
        <SearchSuggestionBox
            history={history}
            location={location}
            datasetSearch={datasetSearch}
            searchText={searchText}
            isSearchInputFocus={isSearchInputFocus}
            inputRef={inputRef}
        />
    )
);

const mapStateToProps = state => {
    return {
        datasetSearch: state.datasetSearch
    };
};

export default connect(mapStateToProps)(SearchSuggestionBoxWithRouter);
