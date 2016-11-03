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
                    resetFacet ={this.props.resetPublisherFacet}
        />

      </div>
    );
  }
}

SearchFacets.propTypes={updateQuery: React.PropTypes.func};

export default SearchFacets;
