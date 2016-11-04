import React, { Component } from 'react';
// eslint-disable-next-line
import {RouterContext } from 'react-router';
import SearchResults from '../SearchResults/SearchResults';
import SearchFacets from '../SearchFacets/SearchFacets';
import SearchTabs from './SearchTabs';
import SearchBox from './SearchBox';
import ProgressBar from '../UI/ProgressBar';
import debounce from 'lodash.debounce';
import './Search.css';
import getJSON from'../helpers/getJSON';
import defined from '../helpers/defined';
import toggleQuery from '../helpers/toggleQuery';
import checkActiveOption from '../helpers/checkActiveOption';
import Pagination from '../UI/Pagination';
import findindex from 'lodash.findindex';
import find from 'lodash.find';

const FACETS = ['publisher', 'jurisdictionId', 'jurisdictionType', 'dateTo', 'dateFrom', 'format'];
const NUMBERRESULTSPERPAGE = 20;



const SETTINGS ={
  resultsPerPage: 20,
  optionsVisible: 5,
  facets: ['publisher', 'regionId', 'regionType', 'dateTo', 'dateFrom', 'format'],
  publisherAllowMultiple: true,
  formatAllowMultiple: true,
  regionTypeAllowMultiple: false,
  regionIdAllowMultiple: false,
  dateToAllowMultiple: false,
  dateFromAllowMultiple: false
}


class Search extends Component {
  constructor(props) {
    super(props);

    this.updateSearchText=this.updateSearchText.bind(this);
    this.goToPage=this.goToPage.bind(this);
    this.updateQuery = this.updateQuery.bind(this);
    this.updateProgress = this.updateProgress.bind(this);
    this.removeAllfacets = this.removeAllfacets.bind(this);
    this.transferComplete = this.transferComplete.bind(this);
    this.debouncedSearch = debounce(this.doSearch, 1000);

    this.togglePublisherOption= this.togglePublisherOption.bind(this);
    this.toggleFormatOption=this.toggleFormatOption.bind(this);
    this.toggleRegionOption=this.toggleRegionOption.bind(this);
    this.toggleTemporalOption=this.toggleTemporalOption.bind(this);

    this.resetPublisherFacet = this.resetPublisherFacet.bind(this);

    this.searchPublisherFacet = this.searchPublisherFacet.bind(this);

    /**
     * @type {Object}
     * @property {Array} searchResults results from search
     * @property {Array} facetPublisherOptions default list of publisher to display in the publisher facet facet
     * @property {Array} facetTemporalOptions default list of dates to display in the publisher facet facet
     * @property {Array} facetFormatOptions default list of format to display in the publisher facet facetss
     * @property {Number} loadingProgress the percentage of the search progress
     * @property {Object} userEnteredQuery query returned from natual language processing
     */
    this.state = {
      datasetsSearchResults: [],

      facetPublisherOptions: [],
      facetTemporalOptions: [],
      facetFormatOptions: [],

      facetPublisherSearchResults: [],
      facetRegionSearchResults: [],
      facetFormatSearchResults: [],

      activePublisherOptions: [],
      activeFormatOptions: [],
      activeRegionOptions: [],
      activeTemporalOptions: [],

      loadingProgress: null,
      userEnteredQuery: {},
      totalNumberOfResults : 0
    };
  }

  updateSearchText(newText) {
    this.updateQuery({ q: newText });
    // remove all previous facets
    this.removeAllfacets();
    this.debouncedSearch();
  }

  componentWillMount(){
    if(this.props.location.query.q && this.props.location.query.q.length > 0){
      this.doSearch();
    }
  }

  // one seaarch to update them all
  doSearch(){
      let query = this.props.location.query;
      let keyword = query.q;
      let dateFrom = defined(query.dateFrom) ? 'from ' + query.dateFrom : '';
      let dateTo=defined(query.dateTo) ? 'to ' + query.dateTo : '';
      let publisher = queryToString('by', query.publisher);
      let format = queryToString('as', query.format);
      let location = queryToRegion(query.jurisdiction, query.jurisdictionType);
      let startIndex = defined(query.page) ? (query.page - 1)*NUMBERRESULTSPERPAGE + 1 : 0;

      let searchTerm =
      encodeURI(`${keyword} ${publisher} ${format} ${dateFrom} ${dateTo} ${location}&start=${startIndex}&limit=${NUMBERRESULTSPERPAGE}`);

      this.setState({
        loadingProgress: 0
      })

      getJSON(`http://magda-search-api.terria.io/datasets/search?query=${searchTerm}`,
        this.updateProgress,
        this.transferComplete).then((data)=>{

        let results= [];
        if(keyword.length > 0){
          results = data.dataSets;
        }

        let _activePublisherOptions = data.query.publishers;

        this.setState({
            searchResults: results,
            userEnteredQuery: data.query,
            totalNumberOfResults: +data.hitCount,
            // specify which facets shouldn't update
            facetPublisherOptions: data.facets[0].options,
            facetTemporalOptions: data.facets[1].options,
            facetFormatOptions: data.facets[2].options,

            activePublisherOptions: this.getOptionFromString(data.query.publishers, data.facets[0].options) || [],
            activeFormatOptions: this.getOptionFromString(data.query.formats, data.facets[2].options) || [],

          });
          // this.parseQuery(data.query);
        }, (err)=>{console.warn(err)});
  }


  getOptionFromString(listOfString, options){
    return listOfString.map(s=>find(options, o=>o.value === s));
  }


  searchPublisherFacet(facetSearchWord){
    let url =  `http://magda-search-api.terria.io/facets/publisher/options/search?generalQuery=${encodeURI(this.props.location.query.q)}&facetQuery=${encodeURI(facetSearchWord)}`;
    getJSON(url).then(data=>{
      this.setState({
        facetPublisherSearchResults: data.options
      });
    });
  }

  searchFormatFacet(facetId, facetSearchWord){
    this.setState({
      facetFormatSearchResults: []
    })

  }

  searchRegionFacet(facetId, facetSearchWord){
    this.setState({
      facetRegionSearchResults: []
    })
  }

  resetPublisherFacet(){
    this.setState({
      activePublisherOptions: []
    });
    this.updateQuery({'publisher': []});
  }

  resetFormatFacet(){
    this.setState({
      activeFormatOptions: []
    });
    this.updateQuery({'format': []});
  }

  resetRegionFacet(){
    this.setState({
      activeRegionOptions: []
    });
    this.updateQuery({'regionId': []});
    this.updateQuery({'regionType': []});
  }

  resetTemporalFacet(){
    this.setState({
      activeTemporalOptions: []
    });
    this.updateQuery({'dateFrom': []});
    this.updateQuery({'dateTo': []});
  }



  removeAllfacets(){
    SETTINGS.facets.forEach(f=>{
      this.updateQuery({[f]: []});
    });
  }

  goToPage(index){
    this.updateQuery({
      page: index
    })
  }

  updateQuery(query){
    this.context.router.push({
      pathname: this.props.location.pathname,
      query: Object.assign(this.props.location.query, query)
    });
  }

  // progress on transfers from the server to the client (downloads)
  updateProgress (oEvent) {
    if (oEvent.lengthComputable) {
      this.setState({
        loadingProgress: oEvent.loaded / oEvent.total
      })
    } else {
      // Unable to compute progress information since the total size is unknown
      console.log('Unable to compute progress information since the total size is unknown');
    }
  }

  transferComplete(evt) {
    this.setState({
      loadingProgress: 1
    });
  }


  togglePublisherOption(option, callback){
    let existingQuery = this.state.activePublisherOptions.slice();
    let index = findindex(existingQuery, q=>q.value === option.value);
    if(index === -1){
      existingQuery.push(option);

    }else{
      existingQuery.splice(index, 1)
    }

    this.setState({
      activePublisherOptions: existingQuery
    });
    this.updateQuery({'publisher': existingQuery.map(q=>q.value)})
    if(defined(callback) && typeof callback === 'function'){
      callback();
    }
  }

  toggleFormatOption(option, callback){
    let existingQuery = this.state.activeFormatOptions.slice();
    let index = findindex(existingQuery, q=>q.value === option.value);
    if(index === -1){
      existingQuery.push(option);

    }else{
      existingQuery.splice(index, 1)
    }

    this.setState({
      activeFormatOptions: existingQuery
    });


    this.updateQuery({'format': existingQuery.map(q=>q.value)})
    if(defined(callback) && typeof callback === 'function'){
      callback();
    }
  }

  toggleTemporalOption(option, callback){

  }

  toggleRegionOption(regionId, regionType, callback){

  }

  render() {
    return (
      <div>
        {defined(this.state.loadingProgress) && <ProgressBar progress={this.state.loadingProgress}/>}
        <div className='search'>
          <div className='search__search-header'>
            <div className='container'>
              <SearchBox searchValue={this.props.location.query.q}
                         updateSearchText={this.updateSearchText}
              />
            </div>
          </div>
          <div className='container search__search-body'>
            <div className='col-sm-4'>
                  <SearchFacets

                    facetPublisherOptions={this.state.facetPublisherOptions}
                    facetTemporalOptions={this.state.facetTemporalOptions}
                    facetFormatOptions={this.state.facetFormatOptions}

                    facetPublisherSearchResults={this.state.facetPublisherSearchResults}
                    facetRegionSearchResults={this.state.facetRegionSearchResults}
                    facetFormatSearchResults={this.state.facetFormatSearchResults}

                    activeRegionOptions={this.state.activeRegionOptions}
                    activeTemporalOptions={this.state.activeTemporalOptions}
                    activePublisherOptions={this.state.activePublisherOptions}
                    activeFormatOptions={this.state.activeFormatOptions}

                    searchPublisherFacet={this.searchPublisherFacet}
                    searchRegionFacet={this.searchRegionFacet}
                    searchFormatFacet={this.searchFormatFacet}

                    resetPublisherFacet={this.resetPublisherFacet}
                    resetFormatFacet={this.resetFormatFacet}

                    togglePublisherOption={this.togglePublisherOption}
                    toggleTemporalOption={this.toggleTemporalOption}
                    toggleFormatOption={this.toggleFormatOption}
                    toggleRegionOption={this.toggleRegionOption}

                    updateQuery={this.updateQuery}
                    SETTINGS={SETTINGS}
                  />
              </div>
              <div className='col-sm-8'>
                  <SearchResults
                    searchResults={this.state.searchResults}
                    totalNumberOfResults={this.state.totalNumberOfResults}
                  />

                  {
                    // only show pagination if result count is bigger than default number of results to show per page
                    (this.state.totalNumberOfResults > NUMBERRESULTSPERPAGE) &&
                    <Pagination
                      currentPage={+this.props.location.query.page || 1}
                      maxPage={Math.ceil(this.state.totalNumberOfResults/NUMBERRESULTSPERPAGE)}
                      goToPage={this.goToPage}/>
                  }
            </div>
          </div>
        </div>
      </div>
    );
  }
}

function queryToString(preposition, query){
  if(!defined(query)) return '';
  if(Array.isArray(query)){
    return query.map(q=>
    `${preposition} ${q}`).join(' ')
  } else {
    return `${preposition} ${query}`
  }
}

function queryToRegion(regionid, regiontype){
  if(!defined(regionid) || !defined(regiontype)) return '';
  return `in ${regiontype}:${regionid}`;
}

Search.contextTypes ={
  router: React.PropTypes.object.isRequired
}


export default Search;
