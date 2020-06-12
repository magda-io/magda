import { updatePublishers, resetPublisher } from "actions/datasetSearchActions";
import { connect } from "react-redux";
import { fetchPublisherSearchResults } from "actions/facetPublisherSearchActions";
import React, { Component } from "react";
import FacetBasic from "./FacetBasic";
import queryString from "query-string";
import MagdaNamespacesConsumer from "Components/i18n/MagdaNamespacesConsumer";

class Publisher extends Component {
    constructor(props) {
        super(props);
        this.onResetPublisherFacet = this.onResetPublisherFacet.bind(this);
        this.onSearchPublisherFacet = this.onSearchPublisherFacet.bind(this);
        this.onTogglePublisherOption = this.onTogglePublisherOption.bind(this);
        // we use an integer event to notify children of the reset event
        //-- we should find a better way to do this. At least, its value should be set synchronously
        //-- Can't use state as you don't know when it's in place
        this.resetFilterEvent = 0;
    }

    onTogglePublisherOption(publishers) {
        const queryOptions = publishers.map((p) => p.value);
        this.props.updateQuery({
            organisation: queryOptions,
            page: undefined
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
        this.resetFilterEvent++;
    }

    componentDidUpdate(prevProps) {
        if (this.props.location.search !== prevProps.location.search) {
            const query = queryString.parse(this.props.location.search);
            if (!query.organisation) {
                this.props.dispatch(resetPublisher());
                this.resetFilterEvent++;
            }
        }
    }

    onSearchPublisherFacet(facetQuery) {
        this.props.dispatch(
            fetchPublisherSearchResults(this.props.generalQuery, facetQuery)
        );
    }

    render() {
        return (
            <MagdaNamespacesConsumer ns={["searchDatasetsPage"]}>
                {(translate) => (
                    <FacetBasic
                        title={translate(["publisherFilterTitle", "Publisher"])}
                        id="publisher"
                        hasQuery={Boolean(this.props.activePublishers.length)}
                        options={
                            this.props.publisherSearchResults ||
                            this.props.publisherOptions
                        }
                        activeOptions={this.props.activePublishers}
                        onToggleOption={this.onTogglePublisherOption}
                        onResetFacet={this.onResetPublisherFacet}
                        searchFacet={this.onSearchPublisherFacet}
                        toggleFacet={this.props.toggleFacet}
                        isOpen={this.props.isOpen}
                        closeFacet={this.props.closeFacet}
                        resetFilterEvent={this.resetFilterEvent}
                    />
                )}
            </MagdaNamespacesConsumer>
        );
    }
}

function mapStateToProps(state) {
    let { datasetSearch, facetPublisherSearch } = state;
    return {
        publisherOptions: datasetSearch.publisherOptions,
        activePublishers: datasetSearch.activePublishers,
        publisherSearchResults: facetPublisherSearch.data,
        generalQuery: datasetSearch.queryObject
    };
}

export default connect(mapStateToProps)(Publisher);
