import React, { Component } from "react";
import { connect } from "react-redux";
import { withRouter } from "react-router-dom";
import PropTypes from "prop-types";
import queryString from "query-string";
import getDateString from "../../helpers/getDateString";
import MarkdownViewer from "../../UI/MarkdownViewer";
import { Small, Medium } from "../../UI/Responsive";
import {
    retrieveLocalData,
    prependToLocalStorageArray,
    deleteFromLocalStorageArray
} from "../../storage/localStorage";
import "./SearchSuggestionBox.css";
import recentSearchIcon from "../../assets/updated.svg";
import closeIcon from "../../assets/mobile-menu-close.svg";
import isEqual from "lodash.isequal";

type searchDataType = {
    name: ?string,
    regionName: ?string,
    data: object
};

const KEY_CODE_ARROW_DOWN = 40;
const KEY_CODE_ARROW_LEFT = 37;
const KEY_CODE_ARROW_UP = 38;
const KEY_CODE_ARROW_RIGHT = 39;
const KEY_CODE_ENTER = 13;
const KEY_CODE_ESC = 27;

/**
 * when no user input, the first `maxDefaultListItemNumber` items will be returned
 */
const maxDefaultListItemNumber = 5;

/**
 * Max no.of items will be saved locally
 */
const maxSavedItemNumber = 5;

function getRecentSearches() {
    const items = retrieveLocalData("recentSearches", []);
    if (!items || typeof items !== "object" || !items.length) {
        return [];
    } else {
        return items;
    }
}

class SearchSuggestionBox extends Component {
    constructor(props) {
        super(props);
        this.state = {
            isMouseOver: false,
            recentSearches: getRecentSearches(),
            selectedItemIdx: null,
            manuallyHidden: false
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
        const recentSearches = prependToLocalStorageArray(
            "recentSearches",
            searchData,
            maxSavedItemNumber,
            []
        );
        this.setState({ recentSearches });
    }

    componentDidUpdate(prevProps, prevState) {
        this.saveRecentSearch(this.props, prevProps);
        this.setupSearchInputListener(this.props);

        if (
            prevState.selectedItemIdx !== this.state.selectedItemIdx ||
            prevState.deleteSelected !== this.state.deleteSelected
        ) {
            this.props.onSelectedIdChange &&
                this.props.onSelectedIdChange(
                    this.state.selectedItemIdx
                        ? this.buildOptionId(
                              this.state.selectedItemIdx,
                              this.state.deleteSelected
                          )
                        : null
                );
        }
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
        this.deleteItem(idx);
    }

    deleteItem(idx) {
        const recentSearches = deleteFromLocalStorageArray(
            "recentSearches",
            idx,
            []
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
        if (!this.props.isSearchInputFocus && !this.state.isMouseOver) {
            return false;
        }
        if (this.state.manuallyHidden) {
            return false;
        }
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

        this.setState({
            manuallyHidden: false
        });

        if (!this.shouldShow()) return;
        if (keyCode === KEY_CODE_ENTER && this.state.selectedItemIdx !== null) {
            e.preventDefault();
            e.stopImmediatePropagation();
            if (this.state.deleteSelected) {
                this.deleteItem(this.state.selectedItemIdx);
            } else {
                this.executeSearchItem(
                    this.state.recentSearches[this.state.selectedItemIdx]
                );
            }
            return;
        }
        if (
            keyCode === KEY_CODE_ARROW_UP &&
            this.state.selectedItemIdx !== null
        ) {
            e.preventDefault(); //--- stop cursor from moving to the beginning of the input text
        }
        switch (keyCode) {
            case KEY_CODE_ARROW_DOWN:
                this.selectNextItem();
                break;
            case KEY_CODE_ARROW_UP:
                this.selectPrevItem();
                break;
            case KEY_CODE_ARROW_LEFT:
                this.setState({
                    deleteSelected: false
                });
                break;
            case KEY_CODE_ARROW_RIGHT:
                this.setState({
                    deleteSelected: true
                });
                break;
            case KEY_CODE_ESC:
                this.setState({
                    manuallyHidden: true
                });
                break;
        }
    }

    selectNextItem() {
        const maxNumber = this.getSavedSearchItemsNumber();
        if (!maxNumber) return;
        let newIdx;
        if (this.state.selectedItemIdx === null) newIdx = 0;
        else newIdx = (this.state.selectedItemIdx + 1) % maxNumber;
        this.selectItem(newIdx);
    }

    selectPrevItem() {
        if (this.state.selectedItemIdx === null) return;
        let newIdx = this.state.selectedItemIdx - 1;
        if (newIdx < 0) newIdx = null;
        this.selectItem(newIdx);
    }

    selectItem(index) {
        this.setState({
            selectedItemIdx: index
        });
    }

    getSavedSearchItemsNumber() {
        const recentSearchItems = this.state.recentSearches;
        if (!recentSearchItems) return 0;
        return recentSearchItems.length;
    }

    buildOptionId(idx, deleteSelected = false) {
        return `search-history-item-${idx}${
            deleteSelected ? "-delete-button" : ""
        }`;
    }

    render() {
        if (!this.shouldShow()) return null;
        const recentSearchItems = this.state.recentSearches;
        return (
            <div
                className="search-suggestion-box"
                ref={el => (this.containerRef = el)}
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
                    <ul id="search-history-items" role="listbox">
                        {recentSearchItems.map((item, idx) => (
                            <li
                                key={idx}
                                className={`search-item-container ${
                                    this.state.selectedItemIdx === idx &&
                                    !this.state.deleteSelected
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
                                    role="option"
                                    id={this.buildOptionId(idx)}
                                    className="au-btn au-btn--tertiary search-item-main-button"
                                    onClick={e =>
                                        this.onSearchItemClick(e, item)
                                    }
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
                                            {item.data.q
                                                ? item.data.q.trim()
                                                : ""}
                                        </div>
                                    </Small>
                                </button>
                                <button
                                    id={this.buildOptionId(idx, true)}
                                    className={`au-btn au-btn--tertiary search-item-delete-button ${
                                        this.state.deleteSelected &&
                                        this.state.selectedItemIdx === idx
                                            ? "search-item-delete-button--selected"
                                            : ""
                                    }`}
                                    onClick={e =>
                                        this.onDeleteItemClick(e, idx)
                                    }
                                >
                                    <img
                                        alt="delete search item"
                                        src={closeIcon}
                                    />
                                </button>
                            </li>
                        ))}
                    </ul>
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

const SearchSuggestionBoxWithRouter = withRouter(props => (
    <SearchSuggestionBox {...props} />
));

const mapStateToProps = state => {
    return {
        datasetSearch: state.datasetSearch
    };
};

export default connect(mapStateToProps)(SearchSuggestionBoxWithRouter);
