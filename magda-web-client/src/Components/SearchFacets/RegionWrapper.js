import React from "react";
import FacetRegion from "./FacetRegion";
import defined from "../../helpers/defined";
import FacetHeader from "./FacetHeader";

//Wrapper for the FacetHeader and FacetRegion components
export default class RegionWrapper extends React.Component {
    render() {
        return (
            <React.Fragment>
                <FacetHeader
                    onResetFacet={this.props.onResetFacet}
                    title={this.props.title}
                    id={this.props.id}
                    activeOptions={[this.props.activeRegion]}
                    hasQuery={this.props.hasQuery}
                    onClick={this.props.toggleFacet}
                    isOpen={this.props.isOpen}
                />
                <FacetRegion
                    title={this.props.title}
                    id={this.props.id}
                    hasQuery={
                        defined(this.props.activeRegion.regionType) &&
                        defined(this.props.activeRegion.regionId)
                    }
                    activeRegion={this.props.activeRegion}
                    facetSearchResults={this.props.facetSearchResults}
                    onToggleOption={this.props.onToggleOption}
                    onResetFacet={this.props.onResetFacet}
                    searchFacet={this.props.searchFacet}
                    regionMapping={this.props.regionMapping}
                    toggleFacet={this.props.toggleFacet}
                    isOpen={this.props.isOpen}
                    closeFacet={this.props.closeFacet}
                    resetFilterEvent={this.props.resetFilterEvent}
                />
            </React.Fragment>
        );
    }
}
