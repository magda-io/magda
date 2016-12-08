import FacetRegion from './FacetRegion';
import FacetBasic from './FacetBasic';
import FacetTemporal from './FacetTemporal';
import React, { Component } from 'react';
import defined from '../helpers/defined';

class SearchFacets extends Component {
  render() {
    return (
      <div>
        <FacetBasic title='publisher'
                    id='publisher'
                    hasQuery={Boolean(this.props.activePublishers.length)}
                    options={this.props.publisherOptions}
                    activeOptions={this.props.activePublishers}
                    facetSearchResults={this.props.publisherSearchResults}
                    onToggleOption={this.props.onTogglePublisherOption}
                    onResetFacet={this.props.onResetPublisherFacet}
                    searchFacet={this.props.onSearchPublisherFacet}
        />
        <FacetRegion title='location'
                      id='region'
                      hasQuery={defined(this.props.activeRegion.regionType) && defined(this.props.activeRegion.regionId)}
                      activeRegion={this.props.activeRegion}
                      facetSearchResults={this.props.regionSearchResults}
                      onToggleOption={this.props.onToggleRegionOption}
                      onResetFacet={this.props.onResetRegionFacet}
                      searchFacet={this.props.onSearchRegionFacet}
                      regionMapping={this.props.regionMapping}
        />
        <FacetTemporal title='date range'
                      id='temporal'
                      hasQuery={(defined(this.props.activeDateFrom) || defined(this.props.activeDateTo))}
                      options={this.props.temporalOptions}
                      activeDates={[this.props.activeDateFrom, this.props.activeDateTo]}
                      onToggleOption={this.props.onToggleTemporalOption}
                      onResetFacet={this.props.onResetTemporalFacet}
        />
        <FacetBasic title='format'
                    id='format'
                    hasQuery={Boolean(this.props.activeFormats.length)}
                    options={this.props.formatOptions}
                    activeOptions={this.props.activeFormats}
                    facetSearchResults={this.props.formatSearchResults}
                    onToggleOption={this.props.onToggleFormatOption}
                    onResetFacet={this.props.onResetFormatFacet}
                    searchFacet={this.props.onSearchFormatFacet}
        />
      </div>
    );
  }
}

export default SearchFacets;
