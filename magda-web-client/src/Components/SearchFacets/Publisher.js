import {
    updatePublishers,
    resetPublisher
} from "../../actions/datasetSearchActions";
import { connect } from "react-redux";
import { fetchPublisherSearchResults } from "../../actions/facetPublisherSearchActions";
import React, { Component } from "react";
import FacetBasic from "./FacetBasic";
import queryString from "query-string";
class Publisher extends Component {
    constructor(props) {
        super(props);
        this.onResetPublisherFacet = this.onResetPublisherFacet.bind(this);
        this.onSearchPublisherFacet = this.onSearchPublisherFacet.bind(this);
        this.onTogglePublisherOption = this.onTogglePublisherOption.bind(this);
        // we use an integer event to notify children of the reset event
        this.state = {
            resetFilterEvent: 0
        };
    }

    onTogglePublisherOption(publishers) {
        const queryOptions = publishers.map(p => p.value);
        this.props.updateQuery({
            organisation: queryOptions
        });
        this.props.dispatch(updatePublishers(publishers));
        this.props.closeFacet();
    }

    onResetPublisherFacet() {
        // update url
        this.props.updateQuery({
            organisation: [],
            page: undefined
        });
        // update redux
        this.props.dispatch(resetPublisher());
        // let children know that the filter is being reset
        this.setState({
            resetFilterEvent: this.state.resetFilterEvent + 1
        });
    }

    onSearchPublisherFacet() {
        this.props.dispatch(
            fetchPublisherSearchResults(
                queryString.parse(this.props.location.search).q || "*"
            )
        );
    }

    render() {
        return (
            <FacetBasic
                title="organisation"
                id="publisher"
                hasQuery={Boolean(this.props.activePublishers.length)}
                options={this.props.publisherOptions}
                activeOptions={this.props.activePublishers}
                facetSearchResults={this.props.publisherSearchResults}
                onToggleOption={this.onTogglePublisherOption}
                onResetFacet={this.onResetPublisherFacet}
                searchFacet={this.onSearchPublisherFacet}
                toggleFacet={this.props.toggleFacet}
                isOpen={this.props.isOpen}
                closeFacet={this.props.closeFacet}
                resetFilterEvent={this.state.resetFilterEvent}
            />
        );
    }
}

function mapStateToProps(state) {
    let { datasetSearch, facetPublisherSearch } = state;
    return {
        publisherOptions: datasetSearch.publisherOptions,
        activePublishers: datasetSearch.activePublishers,
        publisherSearchResults: facetPublisherSearch.data
    };
}

export default connect(mapStateToProps)(Publisher);
