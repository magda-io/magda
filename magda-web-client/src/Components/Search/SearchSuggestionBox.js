import React, { Component } from "react";
import { connect } from "react-redux";
import { withRouter } from "react-router-dom";
import PropTypes from "prop-types";
import uniqWith from "lodash.uniqwith";
import isEqual from "lodash.isequal";
import queryString from "query-string";
import "./SearchSuggestionBox.css";

class SearchSuggestionBox extends Component {
    constructor(props) {
        super(props);
        this.state = {
            recentSearches: this.retrieveLocalData("recentSearches"),
            savedSearches: this.retrieveLocalData("savedSearches")
        };
        this.onSearchItemClick = this.onSearchItemClick.bind(this);
        this.createSearchDataFromProps(this.props);
    }

    retrieveLocalData(key) {
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

    insertItemIntoLocalData(key, data, limit = 0) {
        if (!window.localStorage) return [];
        let items = this.retrieveLocalData(key);
        items
            .filter(item => { // --- remove similar search before insert
                let c = { ...item };
                let dataC = { ...data };
                delete c["__regionName"];
                delete dataC["__regionName"];
                return !isEqual(c, dataC);
            })
            .push(data);
        if (limit && limit >= 1) items = items.slice(0, limit - 1);
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

    createSearchDataFromProps(props) {
        if (!props.location || !props.location.search) return null;
        const data = queryString.parse(props.location.search);
        if (!Object.keys(data).length) return null;
        if (data.regionId) {
            if (
                props.datasetSearch &&
                props.datasetSearch.activeRegion &&
                props.datasetSearch.activeRegion.regionName
            )
                data["__regionName"] =
                    props.datasetSearch.activeRegion.regionName;
            else data["__regionName"] = "";
        }
        return data;
    }

    componentWillReceiveProps(newProps) {
        this.createSearchDataFromProps(newProps);
    }

    onSearchItemClick(e) {
        e.preventDefault();
        this.props.history.push(
            "./search?q=city&dateFrom=1840-07-31T14%3A00%3A00.000Z&dateTo=2016-06-30T14%3A00%3A00.000Z&publisher=City%20of%20Adelaide&publisher=City%20of%20Hobart&regionId=4&regionType=STE"
        );
    }

    render() {
        return (
            <div className="search-suggestion-box">
                <div className="search-suggestion-box-position-adjust" />
                <div className="search-suggestion-box-body">
                    <h5>Recent Searches</h5>
                    <button
                        className="mui-btn mui-btn--flat"
                        onClick={this.onSearchItemClick}
                    >
                        Water quality in Parramatta
                    </button>
                    <button
                        className="mui-btn mui-btn--flat"
                        onClick={e => {
                            e.preventDefault();
                            debugger;
                        }}
                    >
                        Water in Sydney
                    </button>
                    <button className="mui-btn mui-btn--flat">
                        Water quality in Parramatta
                    </button>
                    <button className="mui-btn mui-btn--flat">
                        Water quality in Parramatta
                    </button>
                    <button className="mui-btn mui-btn--flat">
                        Water quality in Parramatta
                    </button>
                    <h5>Saved Searches</h5>
                    <button className="mui-btn mui-btn--flat">
                        Flooding water quality in Parramatta
                    </button>
                    <button className="mui-btn mui-btn--flat">
                        Water in Sydney
                    </button>
                    <button className="mui-btn mui-btn--flat">
                        Water quality in Parramatta
                    </button>
                    <button className="mui-btn mui-btn--flat">
                        Water quality in Parramatta
                    </button>
                </div>
            </div>
        );
    }
}
/*

<h5>Recent Searches</h5>
                    <button className="mui-btn mui-btn--flat" onClick={this.onSearchItemClick}>
                        Water quality in Parramatta
                    </button>
                    <button className="mui-btn mui-btn--flat" onClick={(e)=>{
                        e.preventDefault();
                        debugger;
                    }}>
                        Water in Sydney
                    </button>
                    <button className="mui-btn mui-btn--flat">
                        Water quality in Parramatta
                    </button>
                    <button className="mui-btn mui-btn--flat">
                        Water quality in Parramatta
                    </button>
                    <button className="mui-btn mui-btn--flat">
                        Water quality in Parramatta
                    </button>
                    <h5>Saved Searches</h5>
                    <button className="mui-btn mui-btn--flat">
                        Flooding water quality in Parramatta
                    </button>
                    <button className="mui-btn mui-btn--flat">
                        Water in Sydney
                    </button>
                    <button className="mui-btn mui-btn--flat">
                        Water quality in Parramatta
                    </button>
                    <button className="mui-btn mui-btn--flat">
                        Water quality in Parramatta
                    </button>
    */
SearchSuggestionBox.PropTypes = {};

SearchSuggestionBox.defaultProps = {};

const SearchSuggestionBoxWithRouter = withRouter(
    ({ history, location, datasetSearch }) => (
        <SearchSuggestionBox
            history={history}
            location={location}
            datasetSearch={datasetSearch}
        />
    )
);

const mapStateToProps = state => {
    return {
        datasetSearch: state.datasetSearch
    };
};

export default connect(mapStateToProps)(SearchSuggestionBoxWithRouter);
