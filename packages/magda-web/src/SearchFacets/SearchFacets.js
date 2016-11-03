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

      </div>
    );
  }
}

SearchFacets.propTypes={updateQuery: React.PropTypes.func};

export default SearchFacets;
