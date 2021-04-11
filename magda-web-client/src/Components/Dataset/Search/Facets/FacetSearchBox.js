import React, { Component } from "react";
import debounce from "lodash/debounce";

import "./FacetSearchBox.scss";
import { ReactComponent as SearchIcon } from "assets/search-dark.svg";

/**
 * Searchbox for facet facet
 */
class FacetSearchBox extends Component {
    constructor(props) {
        super(props);
        this.state = {
            value: ""
        };
    }

    onChange = (event) => {
        const value = event.target.value;
        this.setState({
            value
        });
        this.debounceDoSearch(value);
    };

    doSearch = (value) => {
        this.props.searchBoxValueChange(value);
    };
    debounceDoSearch = debounce(this.doSearch, 500);

    render() {
        const { value } = this.state;

        // Autosuggest will pass through all these props to the input.
        const inputProps = {
            placeholder: `Search for ${this.props.title}`,
            value,
            onChange: this.onChange
        };

        // Finally, render it!
        return (
            <div className="facet-search-box">
                <SearchIcon className="search-icon" aria-label="search" />
                <input
                    className="au-text-input au-text-input--block"
                    {...inputProps}
                />
            </div>
        );
    }
}

FacetSearchBox.defaultProps = {};

export default FacetSearchBox;
