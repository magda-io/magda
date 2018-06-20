import {
    updateOrganisations,
    resetOrganisation
} from "../../actions/datasetSearchActions";
import { connect } from "react-redux";
import { fetchOrganisationSearchResults } from "../../actions/facetOrganisationSearchActions";
import React, { Component } from "react";
import FacetBasic from "./FacetBasic";
import queryString from "query-string";
class Organisation extends Component {
    constructor(props) {
        super(props);
        this.onResetOrganisationFacet = this.onResetOrganisationFacet.bind(
            this
        );
        this.onSearchOrganisationFacet = this.onSearchOrganisationFacet.bind(
            this
        );
        this.onToggleOrganisationOption = this.onToggleOrganisationOption.bind(
            this
        );
        // we use an integer event to notify children of the reset event
        this.state = {
            resetFilterEvent: 0
        };
    }

    onToggleOrganisationOption(organisations) {
        const queryOptions = organisations.map(p => p.value);
        this.props.updateQuery({
            organisation: queryOptions,
            page: undefined
        });
        this.props.dispatch(updateOrganisations(organisations));
        this.props.closeFacet();
    }

    onResetOrganisationFacet() {
        // update url
        this.props.updateQuery({
            organisation: [],
            page: undefined
        });
        // update redux
        this.props.dispatch(resetOrganisation());
        // let children know that the filter is being reset
        this.setState({
            resetFilterEvent: this.state.resetFilterEvent + 1
        });
    }

    onSearchOrganisationFacet() {
        this.props.dispatch(
            fetchOrganisationSearchResults(
                queryString.parse(this.props.location.search).q || "*"
            )
        );
    }

    render() {
        return (
            <FacetBasic
                title="organisation"
                id="organisation"
                hasQuery={Boolean(this.props.activeOrganisations.length)}
                options={this.props.organisationOptions}
                activeOptions={this.props.activeOrganisations}
                facetSearchResults={this.props.organisationSearchResults}
                onToggleOption={this.onToggleOrganisationOption}
                onResetFacet={this.onResetOrganisationFacet}
                searchFacet={this.onSearchOrganisationFacet}
                toggleFacet={this.props.toggleFacet}
                isOpen={this.props.isOpen}
                closeFacet={this.props.closeFacet}
                resetFilterEvent={this.state.resetFilterEvent}
            />
        );
    }
}

function mapStateToProps(state) {
    let { datasetSearch, facetOrganisationSearch } = state;
    return {
        organisationOptions: datasetSearch.organisationOptions,
        activeOrganisations: datasetSearch.activeOrganisations,
        organisationSearchResults: facetOrganisationSearch.data
    };
}

export default connect(mapStateToProps)(Organisation);
