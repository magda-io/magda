import FacetRegion from './FacetRegion';
import FacetBasic from './FacetBasic';
import FacetTemporal from './FacetTemporal';
import React, { Component } from 'react';
import defined from '../helpers/defined';
import {connect} from 'react-redux';
import {addPublisher, removePublisher, resetPublisher, addRegion, resetRegion, setDateFrom, setDateTo} from '../actions/results';
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

    this.onToggleTemporalOption = this.onToggleTemporalOption.bind(this);
    this.onResetTemporalFacet = this.onResetTemporalFacet.bind(this);
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
    this.props.dispatch(resetRegion());
  }

  onSearchRegionFacet(facetKeyword){
    this.props.dispatch(fetchRegionSearchResults(facetKeyword));
  }

  onToggleTemporalOption(option){
    let tempDateFrom = this.props.activeDateFrom;
    let tempDateTo = this.props.activeDateTo;
    if(!defined(tempDateFrom) && !defined(tempDateTo)){
      tempDateFrom = option;
      tempDateFrom = option;
    }
    if(!defined(tempDateFrom)){
      tempDateFrom = option
    } else if(!defined(tempDateTo)){
      tempDateTo = option
    } else{
      if(!defined(tempDateFrom) || (option.value < tempDateFrom.value) || (option.value === tempDateTo.value)){
        tempDateFrom = option
      }else {
        tempDateTo = option
      }
    }
    let compare = tempDateFrom - tempDateTo;
    let dateFrom = compare >= 0 ? tempDateTo : tempDateFrom;
    let dateTo = compare >= 0 ? tempDateFrom : tempDateTo;

    this.props.updateQuery({
      dateFrom: dateFrom.value,
      dateTo: dateTo.value
    });

    this.props.dispatch(setDateFrom(dateFrom))
    this.props.dispatch(setDateTo(dateTo))
  }

  onResetTemporalFacet(){
    this.props.updateQuery({
      dateFrom: undefined,
      dateTo: undefined
    });
    // dispatch event
    this.props.dispatch(setDateFrom(undefined))
    this.props.dispatch(setDateTo(undefined))
  }


  render() {
    return (
      <div>
        <FacetBasic title='publisher'
                    id='publisher'
                    hasQuery={Boolean(this.props.activePublishers.length)}
                    options={this.props.publisherOptions}
                    activeOptions={this.props.activePublishers}
                    facetSearchResults={this.props.publisherSearchResults}
                    toggleOption={this.onTogglePublisherOption}
                    onResetFacet={this.onResetPublisherFacet}
                    searchFacet={this.onSearchPublisherFacet}
        />
        <FacetRegion title='location'
                      id='region'
                      hasQuery={Boolean(this.props.activeRegions.length)}
                      activeOptions={this.props.activeRegions}
                      facetSearchResults={this.props.regionSearchResults}
                      toggleOption={this.onToggleRegionOption}
                      onResetFacet={this.onResetRegionFacet}
                      searchFacet={this.onSearchRegionFacet}
        />
        <FacetTemporal title='date range'
                      id='temporal'
                      hasQuery={(defined(this.props.activeDateFrom) || defined(this.props.activeDateTo))}
                      options={this.props.temporalOptions}
                      activeOptions={[this.props.activeDateFrom, this.props.activeDateTo]}
                      toggleOption={this.onToggleTemporalOption}
                      onResetFacet={this.onResetTemporalFacet}
        />
      </div>
    );
  }
}

SearchFacets.propTypes={
    updateQuery: React.PropTypes.func.isRequired,
    publisherOptions: React.PropTypes.array.isRequired,
    publisherSearchResults: React.PropTypes.array.isRequired,
    regionSearchResults: React.PropTypes.array.isRequired,
    activePublishers: React.PropTypes.array.isRequired,
    activeRegions: React.PropTypes.array.isRequired,
  };


function mapStateToProps(state) {
  let { results , facetPublisherSearch, facetRegionSearch } = state;
  return {
    publisherOptions: results.publisherOptions,
    formatOptions: results.formatOptions,
    temporalOptions: results.temporalOptions,

    activePublishers: results.activePublishers,
    activeRegions: results.activeRegions,
    activeDateFrom: results.activeDateFrom,
    activeDateTo: results.activeDateTo,

    publisherSearchResults: facetPublisherSearch.data,
    regionSearchResults: facetRegionSearch.data,

  }
}

export default connect(mapStateToProps)(SearchFacets);
