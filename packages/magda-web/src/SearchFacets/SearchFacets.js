import FacetRegion from './FacetRegion';
import FacetBasic from './FacetBasic';
import React, { Component } from 'react';
import defined from '../helpers/defined';
import {connect} from 'react-redux';
import {addPublisher, removePublisher, resetPublisher, addRegion, resetRegion} from '../actions/actions';
import {fetchPublisherSearchResults} from '../actions/facetPublisherSearch';
import {fetchRegionSearchResults} from '../actions/facetRegionSearch';

class SearchFacets extends Component {
  constructor(props) {
    super(props);
    this.onTogglePublisherOption = this.onTogglePublisherOption.bind(this);
    this.onResetPublisherFacet = this.onResetPublisherFacet.bind(this);
    this.onSearchPublisherFacet = this.onSearchPublisherFacet.bind(this);

    this.onToggleRegionOption = this.onToggleRegionOption.bind(this);
    this.onResetRegionFacet = this.onResetRegionFacet.bind(this);
    this.onSearchRegionFacet = this.onSearchRegionFacet.bind(this);
  }


  onTogglePublisherOption(publisher, callback){
    let existingPublishers = this.props.activePublishers.map(o=>o.value);
    let index = existingPublishers.indexOf(publisher.value);
    if(index > - 1){
      // dispath an event
      // this.props.dispatch
      this.props.updateQuery({
        publisher: [...existingPublishers.slice(0, index), ...existingPublishers.slice(index+1)]
      })
      // dispatch event to add an active publisher
      this.props.dispatch(removePublisher(publisher));

    } else{
      this.props.updateQuery({
        publisher: [...existingPublishers, publisher.value]
      })
      // dispatch an event to remove an active publisher
      this.props.dispatch(addPublisher(publisher));
    }
    if(defined(callback) && typeof(callback) === 'function'){
      callback();
    }
  }



  onResetPublisherFacet(){
    // update url
    this.props.updateQuery({
      publisher: []
    })
    // update redux
    this.props.dispatch(resetPublisher());
  }

  onSearchPublisherFacet(facetKeyword){
    this.props.dispatch(fetchPublisherSearchResults(this.props.keyword, facetKeyword))
  }


  onToggleRegionOption(region, callback){
    let {regionId, regionType} = region;
    this.props.updateQuery({
      regionId,
      regionType
    });

    this.props.dispatch(addRegion(region));

    if(defined(callback) && typeof(callback) === 'function'){
      callback();
    }
  }

  onResetRegionFacet(){
    this.props.updateQuery({
      regionId: [],
      regionType: []
    });
    this.props.dispatch(resetRegion(region));
  }

  onSearchRegionFacet(facetKeyword){
    this.props.dispatch(fetchRegionSearchResults(facetKeyword));
  }


  render() {
    return (
      <div>
        <FacetBasic title='publisher'
                    id='publisher'
                    options={this.props.publisherOptions}
                    activeOptions={this.props.activePublishers}
                    facetSearchResults={this.props.publisherSearchResults}
                    toggleOption={this.onTogglePublisherOption}
                    onResetFacet={this.onResetPublisherFacet}
                    searchFacet={this.onSearchPublisherFacet}
        />
        <FacetRegion title='location'
                      id='region'
                      activeOptions={this.props.activeRegions}
                      facetSearchResults={this.props.regionSearchResults}
                      toggleOption={this.onToggleRegionOption}
                      onResetFacet={this.onResetRegionFacet}
                      searchFacet={this.onSearchRegionFacet}
        />
      </div>
    );
  }
}

SearchFacets.propTypes={
    updateQuery: React.PropTypes.func,
    publisherOptions: React.PropTypes.array,
    activePublishers: React.PropTypes.array,
    publisherSearchResults: React.PropTypes.array,
    regionSearchResults: React.PropTypes.array
  };


function mapStateToProps(state) {
  let { results , facetPublisherSearch, facetRegionSearch } = state;
  return {
    publisherOptions: results.data.facets[0].options,
    activePublishers: results.activePublishers,
    activeRegions: results.activeRegions,
    publisherSearchResults: facetPublisherSearch.data,
    regionSearchResults: facetRegionSearch.data
  }
}

export default connect(mapStateToProps)(SearchFacets);
