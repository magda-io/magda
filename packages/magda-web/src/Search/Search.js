// eslint-disable-next-line
import {RouterContext } from 'react-router';

import './Search.css';
import {addPublisher, removePublisher, resetPublisher, addRegion, resetRegion, setDateFrom, setDateTo, addFormat, removeFormat, resetFormat, resetDateFrom, resetDateTo} from '../actions/results';
import {connect} from 'react-redux';
import {fetchFormatSearchResults} from '../actions/facetFormatSearch';
import {fetchPublisherSearchResults} from '../actions/facetPublisherSearch';
import {fetchRegionMapping} from '../actions/regionMapping';
import {fetchRegionSearchResults} from '../actions/facetRegionSearch';
import config from '../config.js';
import debounce from 'lodash.debounce';
import defined from '../helpers/defined';
import Pagination from '../UI/Pagination';
import Notification from '../UI/Notification';
import ProgressBar from '../UI/ProgressBar';
import React, { Component } from 'react';
import SearchBox from './SearchBox';
import SearchFacets from '../SearchFacets/SearchFacets';
import SearchResults from '../SearchResults/SearchResults';
import Recomendations from './Recomendations';
import WelcomeText from './WelcomeText';
import NoMatching from './NoMatching';


class Search extends Component {

  constructor(props) {
    super(props);
    this.debounceUpdateSearchQuery = debounce(this.updateSearchQuery, 3000);
    this.goToPage=this.goToPage.bind(this);
    this.handleSearchFieldEnterKeyPress = this.handleSearchFieldEnterKeyPress.bind(this);
    this.onClickTag = this.onClickTag.bind(this);
    this.onResetPublisherFacet = this.onResetPublisherFacet.bind(this);
    this.onResetRegionFacet = this.onResetRegionFacet.bind(this);
    this.onResetTemporalFacet = this.onResetTemporalFacet.bind(this);
    this.onResetFormatFacet = this.onResetFormatFacet.bind(this);
    this.onSearchFormatFacet = this.onSearchFormatFacet.bind(this);
    this.onSearchPublisherFacet = this.onSearchPublisherFacet.bind(this);
    this.onSearchRegionFacet = this.onSearchRegionFacet.bind(this);
    this.onSearchTextChange = this.onSearchTextChange.bind(this);
    this.onToggleFormatOption = this.onToggleFormatOption.bind(this);
    this.onTogglePublisherOption = this.onTogglePublisherOption.bind(this);
    this.onToggleRegionOption = this.onToggleRegionOption.bind(this);
    this.onToggleTemporalOption = this.onToggleTemporalOption.bind(this);
    this.updateQuery = this.updateQuery.bind(this);
    this.onDismissError = this.onDismissError.bind(this);
    this.modifyUserSearchString = this.modifyUserSearchString.bind(this);
    this.updateSearchQuery = this.updateSearchQuery.bind(this);
    this.onClearSearch = this.onClearSearch.bind(this);
    this.onClickSearch = this.onClickSearch.bind(this);

    // it needs to be undefined here, so the default value should be from the url
    // once this value is set, the value should always be from the user input
    this.state={
      searchText: undefined
    }
  }

  componentWillMount(){
    this.props.dispatch(fetchRegionMapping());
  }

  componentWillReceiveProps(nextProps){
    this.setState({
      searchText: nextProps.location.query.q
    })
  }

  onSearchTextChange(text){
    this.setState({
      searchText: text
    });
    this.debounceUpdateSearchQuery(text);
  }

  onClickTag(tag){
    this.setState({
      searchText: tag
    });
    this.updateSearchQuery(tag);
  }


  updateSearchQuery(text){
    this.updateQuery({
      q: text,
      publisher: [],
      regionId: undefined,
      regionType: undefined,
      dateFrom: undefined,
      dateTo: undefined,
      format: [],
      page: undefined
    });
  }

  onClearSearch(){
    this.updateSearchQuery('');
    this.debounceUpdateSearchQuery.cancel();
  }

  handleSearchFieldEnterKeyPress(event) {
    // when user hit enter, no need to submit the form
    if(event.charCode===13){
        event.preventDefault();
        this.debounceUpdateSearchQuery.flush();
    }
  }

  onClickSearch(){
    this.debounceUpdateSearchQuery.flush();
  }

  goToPage(index){
    this.updateQuery({
      page: index
    })
  }

  updateQuery(query){
    let {router} = this.context;
    router.push({
      pathname: this.props.location.pathname,
      query: Object.assign(this.props.location.query, query)
    });
  }

  getSearchBoxValue(){
    if(defined(this.state.searchText)){
      return this.state.searchText;
    } else if(defined(this.props.location.query.q)){
      return this.props.location.query.q
    }
    return '';
  }

  onTogglePublisherOption(publisher){
    this.toggleBasicOption(publisher, this.props.activePublishers, 'publisher', removePublisher, addPublisher);
  }

  onToggleFormatOption(format){
    this.toggleBasicOption(format, this.props.activeFormats, 'format', removeFormat, addFormat);
  }

  toggleBasicOption(option, activeOptions, key,  removeOption, addOption){
    this.updateQuery({
      page: undefined
    });

    let existingOptions = activeOptions.map(o=>o.value);
    let index = existingOptions.indexOf(option.value);
    if(index > -1){
      this.updateQuery({
        [key]: [...existingOptions.slice(0, index), ...existingOptions.slice(index+1)]
      })
      this.props.dispatch(removeOption(option))
    } else{
      this.updateQuery({
        [key]: [...existingOptions, option.value]
      })
      this.props.dispatch(addOption(option))
    }
  }


  onResetPublisherFacet(){
    // update url
    this.updateQuery({
      publisher: [],
      page: undefined
    })
    // update redux
    this.props.dispatch(resetPublisher());
  }

  onSearchPublisherFacet(facetKeyword){
    this.props.dispatch(fetchPublisherSearchResults(this.props.location.query.q, facetKeyword))
  }


  onResetFormatFacet(){
    this.updateQuery({
      format: [],
      page: undefined
    })
    this.props.dispatch(resetFormat());
  }

  onSearchFormatFacet(facetKeyword){
    this.props.dispatch(fetchFormatSearchResults(this.props.location.query.q, facetKeyword))
  }


  onToggleRegionOption(region){
    let {regionId, regionType} = region;
    this.updateQuery({
      regionId,
      regionType,
      page: undefined
    });

    this.props.dispatch(addRegion(region));
  }

  modifyUserSearchString(additionalString){
    let base = this.props.freeText;
    this.updateSearchQuery(`${base} ${additionalString}`);
  }

  onResetRegionFacet(){
    this.updateQuery({
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
    this.updateQuery({
      dateFrom: defined(datesArray[0]) ? datesArray[0]: undefined,
      dateTo: defined(datesArray[1]) ? datesArray[1]: undefined,
      page: undefined
    });
    this.props.dispatch(setDateTo(datesArray[1]));
    this.props.dispatch(setDateFrom(datesArray[0]));
  }

  onResetTemporalFacet(){
    this.updateQuery({
      dateFrom: undefined,
      dateTo: undefined,
      page: undefined
    });
    // dispatch event
    this.props.dispatch(resetDateFrom());
    this.props.dispatch(resetDateTo());
  }

  onDismissError(){
    this.updateSearchQuery('');
  }


  render() {
    return (
      <div>
        {this.props.isFetching && <ProgressBar progress={this.props.progress}/>}
        <div className='search'>
          <div className='search__search-header'>
            <div className='container'>
              <div className='row'>
              <div className='col-sm-8 col-sm-offset-4'>
                <SearchBox value={this.getSearchBoxValue()}
                           onChange={this.onSearchTextChange}
                           onKeyPress={this.handleSearchFieldEnterKeyPress}
                           onClearSearch={this.onClearSearch}
                           onClickSearch={this.onClickSearch}/>
                {this.getSearchBoxValue().length === 0 &&
                  <WelcomeText onClick={this.updateSearchQuery}/>
                }
              </div>
            </div>
          </div>
          </div>
          <div className='search__search-body container'>
          <div className='row'>
            <div className='col-sm-4 hidden-xs'>
                {this.getSearchBoxValue().length > 0 &&
                 <SearchFacets publisherOptions={this.props.publisherOptions}
                               formatOptions={this.props.formatOptions}
                               temporalOptions={this.props.temporalOptions}
                               activePublishers={this.props.activePublishers}
                               activeRegion={this.props.activeRegion}
                               activeDateFrom={this.props.activeDateFrom}
                               activeDateTo={this.props.activeDateTo}
                               activeFormats={this.props.activeFormats}
                               publisherSearchResults={this.props.publisherSearchResults}
                               regionSearchResults={this.props.regionSearchResults}
                               formatSearchResults={this.props.formatSearchResults}
                               regionMapping={this.props.regionMapping}
                               onResetPublisherFacet={this.onResetPublisherFacet}
                               onResetRegionFacet={this.onResetRegionFacet}
                               onResetTemporalFacet={this.onResetTemporalFacet}
                               onResetFormatFacet={this.onResetFormatFacet}
                               onSearchFormatFacet={this.onSearchFormatFacet}
                               onSearchPublisherFacet={this.onSearchPublisherFacet}
                               onSearchRegionFacet={this.onSearchRegionFacet}
                               onSearchTextChange={this.onSearchTextChange}
                               onToggleFormatOption={this.onToggleFormatOption}
                               onTogglePublisherOption={this.onTogglePublisherOption}
                               onToggleRegionOption={this.onToggleRegionOption}
                               onToggleTemporalOption={this.onToggleTemporalOption}
                />
                }
            </div>
            <div className='col-sm-8'>
                {this.getSearchBoxValue().length > 0 &&
                 !this.props.isFetching &&
                 !this.props.hasError &&
                 <div>
                   <Recomendations options={this.props.publisherOptions}
                                   onClick={this.onTogglePublisherOption}
                                   activeOptions={this.props.activePublishers}
                                   description={"Are you searching for items published by "}
                                   modifyUserSearchString={this.modifyUserSearchString}
                   />
                 {defined(this.props.location.query.q) &&
                  this.props.location.query.q.length > 0 &&
                    <NoMatching datasets={this.props.datasets}
                                strategy={this.props.strategy}
                    />
                  }
                  <SearchResults
                      searchResults={this.props.datasets}
                      totalNumberOfResults={this.props.hitCount}
                      onClickTag={this.onClickTag}
                  />
                  {this.props.hitCount > 20 &&
                      <Pagination
                        currentPage={+this.props.location.query.page || 1}
                        maxPage={Math.ceil(this.props.hitCount/config().resultsPerPage)}
                        goToPage={this.goToPage}
                      />
                   }
                 </div>
               }
               {!this.props.isFetching && this.props.hasError &&
                  <Notification content={this.props.errorMessage}
                                type='error'
                                onDismiss={this.onDismissError}/>
               }
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
}

Search.contextTypes ={
  router: React.PropTypes.object.isRequired,
}

Search.propTypes = {
  datasets: React.PropTypes.array.isRequired,
  hitCount: React.PropTypes.number.isRequired,
  isFetching: React.PropTypes.bool.isRequired,
  dispatch: React.PropTypes.func.isRequired,
  progress: React.PropTypes.number.isRequired,
  hasError: React.PropTypes.bool.isRequired,
  strategy: React.PropTypes.string.isRequired,
  freeText: React.PropTypes.string,
  errorMessage: React.PropTypes.string
}


function mapStateToProps(state) {
  let { results , facetPublisherSearch, facetRegionSearch, facetFormatSearch, regionMapping} = state;
  return {
    datasets: results.datasets,
    hitCount: results.hitCount,
    isFetching: results.isFetching,
    progress: results.progress,
    hasError: results.hasError,
    strategy: results.strategy,
    errorMessage: results.errorMessage,
    freeText: results.freeText,

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

export default connect(mapStateToProps)(Search);
