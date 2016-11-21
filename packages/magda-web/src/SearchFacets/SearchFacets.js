import FacetRegion from './FacetRegion';
import FacetBasic from './FacetBasic';
import FacetTemporal from './FacetTemporal';
import React, { Component } from 'react';
import defined from '../helpers/defined';
import {connect} from 'react-redux';
import {addPublisher, removePublisher, resetPublisher, addRegion, resetRegion, setDateFrom, setDateTo, addFormat, removeFormat, resetFormat, resetDateFrom, resetDateTo} from '../actions/results';
import {fetchPublisherSearchResults} from '../actions/facetPublisherSearch';
import {fetchRegionSearchResults} from '../actions/facetRegionSearch';
import {fetchFormatSearchResults} from '../actions/facetFormatSearch';

class SearchFacets extends Component {
  constructor(props) {
    super(props);
    // this.toggleBasicOption = this.toggleBasicOption.bind(this);
    this.onTogglePublisherOption = this.onTogglePublisherOption.bind(this);
    this.onResetPublisherFacet = this.onResetPublisherFacet.bind(this);
    this.onSearchPublisherFacet = this.onSearchPublisherFacet.bind(this);

    this.onToggleRegionOption = this.onToggleRegionOption.bind(this);
    this.onResetRegionFacet = this.onResetRegionFacet.bind(this);
    this.onSearchRegionFacet = this.onSearchRegionFacet.bind(this);

    this.onToggleTemporalOption = this.onToggleTemporalOption.bind(this);
    this.onResetTemporalFacet = this.onResetTemporalFacet.bind(this);

    this.onToggleFormatOption = this.onToggleFormatOption.bind(this);
    this.onSearchFormatFacet = this.onSearchFormatFacet.bind(this);
    this.onResetFormatFacet = this.onResetFormatFacet.bind(this);
  }


  onTogglePublisherOption(publisher){
    this.toggleBasicOption(publisher, this.props.activePublishers, 'publisher', removePublisher, addPublisher );
  }

  onToggleFormatOption(format){
    this.toggleBasicOption(format, this.props.activeFormats, 'format', removeFormat, addFormat);
  }

  toggleBasicOption(option, activeOptions, key,  removeOption, addOption, updateQuery){
    let existingOptions = activeOptions.map(o=>o.value);
    let index = existingOptions.indexOf(option.value);
    if(index > -1){
      this.props.updateQuery({
        [key]: [...existingOptions.slice(0, index), ...existingOptions.slice(index+1)]
      })
      this.props.dispatch(removeOption(option))
    } else{
      this.props.updateQuery({
        [key]: [...existingOptions, option.value]
      })
      this.props.dispatch(addOption(option))
    }

    this.props.updateQuery({
      page: undefined
    });
  }


  onResetPublisherFacet(){
    // update url
    this.props.updateQuery({
      publisher: [],
      page: undefined
    })
    // update redux
    this.props.dispatch(resetPublisher());
  }

  onSearchPublisherFacet(facetKeyword){
    this.props.dispatch(fetchPublisherSearchResults(this.props.keyword, facetKeyword))
  }


  onResetFormatFacet(){
    this.props.updateQuery({
      format: [],
      page: undefined
    })
    this.props.dispatch(resetFormat());
  }

  onSearchFormatFacet(facetKeyword){
    this.props.dispatch(fetchFormatSearchResults(this.props.keyword, facetKeyword))
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

  onToggleTemporalOption(datesArray){
    this.props.updateQuery({
      dateFrom: defined(datesArray[0]) ? datesArray[0]: undefined,
      dateTo: defined(datesArray[1]) ? datesArray[1]: undefined,
      page: undefined
    });
    this.props.dispatch(setDateTo(datesArray[1]));
    this.props.dispatch(setDateFrom(datesArray[0]));
  }

  onResetTemporalFacet(){
    this.props.updateQuery({
      dateFrom: undefined,
      dateTo: undefined,
      page: undefined
    });
    // dispatch event
    this.props.dispatch(resetDateFrom());
    this.props.dispatch(resetDateTo());
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
                    onToggleOption={this.onTogglePublisherOption}
                    onResetFacet={this.onResetPublisherFacet}
                    searchFacet={this.onSearchPublisherFacet}
        />
        <FacetRegion title='location'
                      id='region'
                      hasQuery={defined(this.props.activeRegion.regionType) && defined(this.props.activeRegion.regionId)}
                      activeRegion={this.props.activeRegion}
                      facetSearchResults={this.props.regionSearchResults}
                      onToggleOption={this.onToggleRegionOption}
                      onResetFacet={this.onResetRegionFacet}
                      searchFacet={this.onSearchRegionFacet}
                      regionMapping={this.props.regionMapping}
        />
        <FacetTemporal title='date range'
                      id='temporal'
                      hasQuery={(defined(this.props.activeDateFrom) || defined(this.props.activeDateTo))}
                      options={this.props.temporalOptions}
                      activeDates={[this.props.activeDateFrom, this.props.activeDateTo]}
                      onToggleOption={this.onToggleTemporalOption}
                      onResetFacet={this.onResetTemporalFacet}
        />
        <FacetBasic title='format'
                    id='format'
                    hasQuery={Boolean(this.props.activeFormats.length)}
                    options={this.props.formatOptions}
                    activeOptions={this.props.activeFormats}
                    facetSearchResults={this.props.formatSearchResults}
                    onToggleOption={this.onToggleFormatOption}
                    onResetFacet={this.onResetFormatFacet}
                    searchFacet={this.onSearchFormatFacet}
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
    regionMapping: React.PropTypes.object,
    activeRegion: React.PropTypes.object,
    activeDateFrom: React.PropTypes.string,
    activeDateTo: React.PropTypes.string
  };


function mapStateToProps(state) {
  let { results , facetPublisherSearch, facetRegionSearch, facetFormatSearch, regionMapping} = state;
  return {
    publisherOptions: results.publisherOptions,
    formatOptions: results.formatOptions,
    temporalOptions: results.temporalOptions,

    activePublishers: results.activePublishers,
    activeRegion: results.activeRegion,
    activeDateFrom: results.activeDateFrom,
    activeDateTo: results.activeDateTo,
    activeFormats: results.activeFormats,

    publisherSearchResults: facetPublisherSearch.data,
    regionSearchResults: facetRegionSearch.data,
    formatSearchResults: facetFormatSearch.data,
    regionMapping: regionMapping.data
  }
}

export default connect(mapStateToProps)(SearchFacets);
