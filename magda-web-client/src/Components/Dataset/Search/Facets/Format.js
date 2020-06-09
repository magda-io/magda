import { updateFormats, resetFormat } from "actions/datasetSearchActions";
import { connect } from "react-redux";
import { fetchFormatSearchResults } from "actions/facetFormatSearchActions";
import React, { Component } from "react";
import FacetBasic from "./FacetBasic";
import queryString from "query-string";

class Format extends Component {
    constructor(props) {
        super(props);
        this.onResetFormatFacet = this.onResetFormatFacet.bind(this);
        this.onSearchFormatFacet = this.onSearchFormatFacet.bind(this);
        this.onToggleFormatOption = this.onToggleFormatOption.bind(this);
        // we use an integer event to notify children of the reset event
        //-- we should find a better way to do this. At least, its value should be set synchronously
        //-- Can't use state as you don't know when it's in place
        this.resetFilterEvent = 0;
    }

    onToggleFormatOption(formats) {
        const queryOptions = formats.map((p) => p.value);
        this.props.updateQuery({
            format: queryOptions,
            page: undefined
        });
        this.props.dispatch(updateFormats(formats));
        this.props.closeFacet();
    }

    onResetFormatFacet() {
        // update url
        this.props.updateQuery({
            format: [],
            page: undefined
        });
        // update redux
        this.props.dispatch(resetFormat());
        // let children know that the filter is being reset
        this.resetFilterEvent++;
    }

    componentDidUpdate(prevProps) {
        if (this.props.location.search !== prevProps.location.search) {
            const query = queryString.parse(this.props.location.search);
            if (!query.format) {
                this.props.dispatch(resetFormat());
                this.resetFilterEvent++;
            }
        }
    }

    onSearchFormatFacet(facetQuery) {
        this.props.dispatch(
            fetchFormatSearchResults(this.props.generalQuery, facetQuery)
        );
    }

    render() {
        return (
            <FacetBasic
                title="format"
                id="format"
                hasQuery={Boolean(this.props.activeFormats.length)}
                options={
                    this.props.formatSearchResults || this.props.formatOptions
                }
                activeOptions={this.props.activeFormats}
                onToggleOption={this.onToggleFormatOption}
                onResetFacet={this.onResetFormatFacet}
                searchFacet={this.onSearchFormatFacet}
                toggleFacet={this.props.toggleFacet}
                isOpen={this.props.isOpen}
                closeFacet={this.props.closeFacet}
                resetFilterEvent={this.resetFilterEvent}
            />
        );
    }
}

function mapStateToProps(state) {
    let { datasetSearch, facetFormatSearch } = state;
    return {
        formatOptions: datasetSearch.formatOptions,
        activeFormats: datasetSearch.activeFormats,
        formatSearchResults: facetFormatSearch.data,
        generalQuery: datasetSearch.queryObject
    };
}

export default connect(mapStateToProps)(Format);
