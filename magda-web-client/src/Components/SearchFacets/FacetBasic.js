import React, { Component } from "react";
import FacetHeader from "./FacetHeader";
import FacetBasicBody from "./FacetBasicBody";

// extends Facet class
class FacetBasic extends Component {
    render() {
        return (
            <div className="facet-wrapper">
                <FacetHeader
                    isOpen={this.props.isOpen}
                    onResetFacet={this.props.onResetFacet}
                    id={this.props.id}
                    title={this.props.title}
                    activeOptions={this.props.activeOptions}
                    hasQuery={this.props.hasQuery}
                    onClick={this.props.toggleFacet}
                />
                {this.props.isOpen && (
                    <FacetBasicBody
                        options={this.props.options}
                        activeOptions={this.props.activeOptions}
                        facetSearchResults={this.props.facetSearchResults}
                        onToggleOption={this.props.onToggleOption}
                        onResetFacet={this.props.onResetFacet}
                        searchFacet={this.props.searchFacet}
                        toggleFacet={this.props.toggleFacet}
                        title={this.props.title}
                        resetFilterEvent={this.props.resetFilterEvent}
                        closeFacet={this.props.closeFacet}
                    />
                )}
            </div>
        );
    }
}

export default FacetBasic;
