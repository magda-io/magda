import { addRegion, resetRegion } from "../../actions/datasetSearchActions";
import { connect } from "react-redux";
import { fetchRegionSearchResults } from "../../actions/facetRegionSearchActions";
import defined from "../../helpers/defined";
import RegionWrapper from "./RegionWrapper";
import React, { Component } from "react";

class Region extends Component {
    constructor(props) {
        super(props);
        this.onResetRegionFacet = this.onResetRegionFacet.bind(this);
        this.onSearchRegionFacet = this.onSearchRegionFacet.bind(this);
        this.onToggleRegionOption = this.onToggleRegionOption.bind(this);
        // we use an integer event to notify children of the reset event
        //-- we should find a better way to do this. At least, its value should be set synchronously
        //-- Can't use state as you don't know when it's in place
        this.resetFilterEvent = 0;
    }

    onToggleRegionOption(region) {
        let { regionId, regionType } = region;
        this.props.updateQuery({
            regionId,
            regionType,
            page: undefined
        });
        this.props.dispatch(addRegion(region));
        this.props.closeFacet();
    }

    onResetRegionFacet() {
        this.props.updateQuery({
            regionId: undefined,
            regionType: undefined,
            page: undefined
        });
        this.props.dispatch(resetRegion());
        // let children know that the filter is being reset
        this.resetFilterEvent++;
    }

    onSearchRegionFacet(facetKeyword) {
        this.props.dispatch(fetchRegionSearchResults(facetKeyword));
    }

    render() {
        return (
            <RegionWrapper
                title="location"
                id="region"
                hasQuery={
                    defined(this.props.activeRegion.regionType) &&
                    defined(this.props.activeRegion.regionId)
                }
                activeRegion={this.props.activeRegion}
                facetSearchResults={this.props.regionSearchResults}
                onToggleOption={this.onToggleRegionOption}
                onResetFacet={this.onResetRegionFacet}
                searchFacet={this.onSearchRegionFacet}
                regionMapping={this.props.regionMapping}
                toggleFacet={this.props.toggleFacet}
                isOpen={this.props.isOpen}
                closeFacet={this.props.closeFacet}
                resetFilterEvent={this.resetFilterEvent}
            />
        );
    }
}

function mapStateToProps(state) {
    let { datasetSearch, facetRegionSearch, regionMapping } = state;
    return {
        activeRegion: datasetSearch.activeRegion,
        regionSearchResults: facetRegionSearch.data,
        regionMapping: regionMapping.data
    };
}

export default connect(mapStateToProps)(Region);
