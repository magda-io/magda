import FacetDateRange from './FacetDateRange';
import FacetJurisdiction from './FacetJurisdiction';
import FacetBasic from './FacetBasic';
import React, { Component } from 'react';


class SearchFacets extends Component {
  render() {
    // only displays the facet facets if there is a search keyword
    return (
      <div>
        <FacetBasic options={this.props.facetPublisherOptions}
                    activeOptions={this.props.activePublisherOptions}
                    facetSearchResults={this.props.facetPublisherSearchResults}
                    title='publisher'
                    id='publisher'
                    toggleOption={this.props.togglePublisherOption}
                    onResetFacet ={this.props.resetPublisherFacet}
                    searchFacet={this.props.searchPublisherFacet}
        />

        <FacetBasic options={this.props.facetFormatOptions}
                    activeOptions={this.props.activeFormatOptions}
                    facetSearchResults={this.props.facetFormatSearchResults}
                    title='format'
                    id='format'
                    toggleOption={this.props.toggleFormatOption}
                    onResetFacet ={this.props.resetFormatFacet}
                    searchFacet={this.props.searchFormatFacet}
        />

        <FacetJurisdiction activeRegionId={this.props.activeRegionId}
                           activeRegionType={this.props.activeRegionType}
                           facetSearchResults={this.props.facetRegionSearchResults}
                           title='Location'
                           id='region'
                           toggleOption={this.props.toggleRegionOption}
                           onResetFacet={this.props.resetRegionFacet}
                           searchFacet={this.props.searchRegionFacet}
        />

      </div>
    );
  }
}

SearchFacets.propTypes={updateQuery: React.PropTypes.func};

export default SearchFacets;
