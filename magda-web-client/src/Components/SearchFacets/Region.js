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

    async onResetRegionFacet() {
        this.props.updateQuery({
            regionId: undefined,
            regionType: undefined,
            page: undefined
        });
        await this.props.dispatch(resetRegion());
        this.props.closeFacet();
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
