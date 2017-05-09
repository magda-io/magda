import {addRegion, resetRegion} from '../actions/results';
import {connect} from 'react-redux';
import {fetchRegionSearchResults} from '../actions/facetRegionSearch';
import defined from '../helpers/defined';
import FacetRegion from './FacetRegion';
import React, { Component } from 'react';

class Region extends Component {

  constructor(props) {
    super(props);
    this.onResetRegionFacet = this.onResetRegionFacet.bind(this);
    this.onSearchRegionFacet = this.onSearchRegionFacet.bind(this);
    this.onToggleRegionOption = this.onToggleRegionOption.bind(this);
  }

  onToggleRegionOption(region){
    let {regionId, regionType} = region;
    this.props.updateQuery({
      regionId,
      regionType,
      page: undefined
    });

    this.props.dispatch(addRegion(region));
  }

  onResetRegionFacet(){
    this.props.updateQuery({
      regionId: undefined,
      regionType: undefined,
      page: undefined
    });
    this.props.dispatch(resetRegion());
  }

  onSearchRegionFacet(facetKeyword){
    this.props.dispatch(fetchRegionSearchResults(facetKeyword));
  }

  render() {
    return (
      <FacetRegion title='location'
                    id='region'
                    hasQuery={defined(this.props.activeRegion.regionType) && defined(this.props.activeRegion.regionId)}
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

Region.propTypes = {
  activeRegions: React.PropTypes.object,
  regionSearchResults: React.PropTypes.array.isRequired,
  updateQuery: React.PropTypes.func.isRequired,
  regionMapping: React.PropTypes.object,
  toggleFacet: React.PropTypes.func,
  isOpen: React.PropTypes.bool,
}


function mapStateToProps(state) {
  let { results , facetRegionSearch, regionMapping} = state;
  return {
    activeRegion: results.activeRegion,
    regionSearchResults: facetRegionSearch.data,
    regionMapping: regionMapping.data
  }
}


export default connect(mapStateToProps)(Region);
