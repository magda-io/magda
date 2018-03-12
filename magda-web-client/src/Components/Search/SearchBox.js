import "./SearchBox.css";
import { connect } from "react-redux";
import { bindActionCreators } from "redux";
import propTypes from "prop-types";
import { config } from "../../config";
import debounce from "lodash.debounce";
import defined from "../../helpers/defined";
import React, { Component } from "react";
import { fetchRegionMapping } from "../../actions/regionMappingActions";
import Form from "muicss/lib/react/form";
import Input from "muicss/lib/react/input";
import search from "../../assets/search-white.svg";
// eslint-disable-next-line
import PropTypes from "prop-types";
import queryString from "query-string";
// import Particles from '../../UI/Particles';

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
            height: 0
        };
    }

    debounceUpdateSearchQuery = debounce(this.updateSearchText, 3000);

    componentWillMount() {
        this.props.fetchRegionMapping();
    }

    componentWillReceiveProps(nextProps) {
        this.setState({
            searchText: nextProps.location.search.q
        });
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
        this.updateQuery({
            q: text,
            publisher: [],
            regionId: undefined,
            regionType: undefined,
            dateFrom: undefined,
            dateTo: undefined,
            format: [],
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

    componentDidMount() {
        // if(this.state.height !== this.container.offsetHeight || this.state.width !== this.container.offsetWidth){
        //   this.setState({
        //     width: this.container.offsetWidth,
        //     height: this.container.offsetHeight
        //   })
        // }
    }

    render() {
        return (
            <Form className="searchBox">
                    <label htmlFor="search">
                        <span className="sr-only">
                            {"search " + config.appName}
                        </span>
                        <Input
                            type="text"
                            name="search"
                            id="search"
                            placeholder="search for open data"
                            value={this.getSearchBoxValue()}
                            onChange={this.onSearchTextChange}
                            onKeyPress={
                                this.handleSearchFieldEnterKeyPress
                            }
                            autoComplete="off"
                        />
                    </label>
                    <button
                        onClick={this.onClickSearch}
                        className="search-btn"
                        type="button">
                        <img src={search} alt="search button" />
                        <span className="sr-only">
                            submit search
                        </span>
                    </button>
            </Form>
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

export default connect(mapStateToProps, mapDispatchToProps)(SearchBox);
