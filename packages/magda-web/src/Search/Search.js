import React, { Component } from 'react';
// eslint-disable-next-line
import {RouterContext } from 'react-router';
import SearchResults from '../SearchResults/SearchResults';
import SearchFilters from '../SearchFilters/SearchFilters';
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

const facets = ['publisher', 'jurisdictionId', 'jurisdictionType', 'dateTo', 'dateFrom', 'format'];



class Search extends Component {
  constructor(props) {
    super(props);

    this.updateSearchText=this.updateSearchText.bind(this);
    this.getSearchQuery=this.getSearchQuery.bind(this);
    this.goToPage=this.goToPage.bind(this);

    this.updateQuery = this.updateQuery.bind(this);
    this.updateProgress = this.updateProgress.bind(this);

    this.removeAllFacets = this.removeAllFacets.bind(this);

    this.transferComplete = this.transferComplete.bind(this);
    this.transferFailed = this.transferFailed.bind(this);
    this.transferCanceled = this.transferCanceled.bind(this);

    this.debouncedSearch = debounce(this.doSearch, 1000);
    this.debouncedGetPublisherFacets = debounce(this.getPublisherFacets, 150);

    /**
     * @type {Object}
     * @property {Array} searchResults results from search
     * @property {Array} filterPublisherOptions default list of publisher to display in the publisher facet filter
     * @property {Array} filterTemporalOptions default list of dates to display in the publisher facet filter
     * @property {Array} filterFormatOptions default list of format to display in the publisher facet filterss
     * @property {Number} loadingProgress the percentage of the search progress
     * @property {Object} userEnteredQuery query returned from natual language processing
     */
    this.state = {
      searchResults: [],
      filterPublisherOptions: [],
      filterTemporalOptions: [],
      filterFormatOptions: [],
      activePublisherOptions: [],
      activeFormatOptions: [],
      loadingProgress: null,
      userEnteredQuery: {}
    };
  }

  updateSearchText(newText) {
    this.updateQuery({ q: newText });
    this.removeAllFacets();
    this.debouncedGetPublisherFacets();
    this.debouncedSearch();
  }

  componentWillMount(){
    if(this.props.location.query.q && this.props.location.query.q.length > 0){
      this.doSearch();
      this.debouncedGetPublisherFacets();
      this.getActiveOptions('publisher');
      this.getActiveOptions('format');
    }
  }

  getPublisherFacets(){
    let query = this.props.location.query;
    let keyword = query.q.split(' ').join('+');
    getJSON(`http://magda-search-api.terria.io/datasets/search?query=${keyword}`).then((data)=>{
      this.setState({
        filterPublisherOptions: data.facets[0].options
      })
      // here get all active options?
    }, (err)=>{console.warn(err)});
  }

  getActiveOptions(id){
    let query = this.props.location.query[id];
    let key = `active${id[0].toUpperCase() + id.slice(1)}Options`;
    if(!defined(query) || query.length === 0){
      this.setState({
        [key] : []
      });
    } else {
      if(!Array.isArray(query)){
       query = [query];
      }
      let tempList = [];
      query.forEach(item=>{
        let url = this.getSearchQuery(id, item);
          // search locally first
          if(defined(this.props.options) && this.props.options.length > 0){
            let option = find(this.props.options, o=>o.value === item);
            if(defined(option)){
              tempList.push(option);
              this.setState({
                [key] : tempList
              });
            } else{
              // search remotely
              this.remotelySearchOption(item, tempList, key, url);
            }
          } else{
            // search remotely
            this.remotelySearchOption(item, tempList, key, url);
          }
      });
    }
  }

  /**
   * if a option from the url does not exist in the default list of filters, we need to remotely search for it to get the hitcount
   * @param {string} item, the option we get from the url, corresponding the [value] of a filter option
   * @param {Array} tempList current list of active options
   */
  remotelySearchOption(item, tempList, key, url){
      // take each of the item and search on server to get the accurate hticount for each one
      console.log(url);
       getJSON(url).then((data)=>{
            // Note: format has lowercase, upper case, and different spelling etc
           let option = data.options.find(o=>o.value === item);
           // if we cannot find the option
           if(!defined(option)){
             option ={
               value: item,
               hitCount: 0
             }
           }
           tempList.push(option);

           this.setState({
             [key] : tempList
           });

       }, (err)=>{console.warn(err)});
  }

  getSearchQuery(facetId, _facetSearchWord){
      // bypass natual language process filtering by using freetext as general query
      let keyword = encodeURI(this.props.location.query.q);
      let facetSearchWord = encodeURI(_facetSearchWord);
      return `http://magda-search-api.terria.io/facets/${facetId}/options/search?generalQuery=${keyword}&facetQuery=${facetSearchWord}`;
  }

  doSearch(){
      let query = this.props.location.query;
      let keyword = query.q.split(' ').join('+');
      let dateFrom = defined(query.dateFrom) ? 'from ' + query.dateFrom : '';
      let dateTo=defined(query.dateTo) ? 'to ' + query.dateTo : '';
      let publisher = queryToString('by', query.publisher);
      let format = queryToString('as', query.format);
      let location = queryToLocation(query.jurisdiction, query.jurisdictionType);

      let searchTerm =
      encodeURI(`${keyword} ${publisher} ${format} ${dateFrom} ${dateTo} ${location}`);

      this.setState({
        loadingProgress: 0
      })

      getJSON(`http://magda-search-api.terria.io/datasets/search?query=${searchTerm}`,
        this.updateProgress,
        this.transferComplete,
        this.transferFailed,
        this.transferCanceled).then((data)=>{

        let results= [];
        if(keyword.length > 0){
          results = data.dataSets;
        }
        this.setState({
            searchResults: results,
            userEnteredQuery: data.query,
            // update year and format facets
            filterTemporalOptions: data.facets[1].options,
            filterFormatOptions: data.facets[2].options
          });
          // this.parseQuery(data.query);
        }, (err)=>{console.warn(err)});
  }

  // parseQuery(query){
  //   if(defined(query)){
  //     if(defined(query.publisher)){this.updateQuery({'publisher': mergeQuery(query.publisher, this.props.location.query.publisher)});}
  //     if(defined(query.format)){this.updateQuery({'format': mergeQuery(query.format, this.props.location.query.format)});}
  //     if(defined(query.dateFrom)){this.updateQuery({'dateFrom': mergeQuery(new Date(query.dateFrom).getFullYear(), this.props.location.query.dateFrom)});}
  //     if(defined(query.dateTo)){this.updateQuery({'dateTo': mergeQuery(new Date(query.dateTo).getFullYear(), this.props.location.query.dateTo)});}
  //   }
  // }

  removeAllFacets(){
    facets.forEach(f=>{
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
    this.getActiveOptions('publisher');
    this.getActiveOptions('format');
    // uncomment this when facet search is activated
    this.debouncedSearch();
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

    // window.setTimeout(()=>{
    //   this.setState({
    //     loadingProgress: null
    //   });
    // }, 2000)
  }

  transferFailed(evt) {
    console.warn("An error occurred while transferring the file.");
    this.setState({
      loadingProgress: null
    })
  }

  transferCanceled(evt) {
    console.warn("The transfer has been canceled by the user.");
    this.setState({
      loadingProgress: null
    })
  }

  toggleOption(option, allowMultiple, facetId){
    let query = toggleQuery(option, this.props.location.query[facetId], allowMultiple);
    this.updateQuery({[facetId]: query});
  }

  suggestionText(){
    let q = this.state.userEnteredQuery;
    let matchedPublishers = this.state.filterPublisherOptions.filter(p=>p.matched === true);

    let publisherAllowMultiple = true;

    if(matchedPublishers.length > 0 && defined(q.freeText)){
      return <span>Are you searching for <strong>{q.freeText}</strong> published by {matchedPublishers.map((p, i)=>
        <button onClick={this.toggleOption.bind(this, p, publisherAllowMultiple, 'publisher')} className={`${checkActiveOption(p, this.props.location.query.publisher) ? 'is-active' : ''} btn btn-suggested-option`} key={p.value}>{p.value} </button>)} ? </span>;
    }
    return null
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
              <div className="col-sm-8 col-sm-offset-4 search-suggestions">
                {this.suggestionText()}
              </div>
            </div>
          </div>
          <div className='container search__search-body'>
            <div className='search__search-body__header clearfix'>
              <SearchTabs />
            </div>
            <div className='row search__search-body__body'>
              {this.props.location.query.q && this.props.location.query.q.length > 0 && <div className='col-sm-4'>
                  <SearchFilters
                    filterPublisherOptions={this.state.filterPublisherOptions}
                    filterTemporalOptions={this.state.filterTemporalOptions}
                    filterFormatOptions={this.state.filterFormatOptions}
                    getSearchQuery={this.getSearchQuery}
                    activePublisherOptions={this.state.activePublisherOptions}
                    activeFormatOptions={this.state.activeFormatOptions}
                    location={this.props.location}
                    updateQuery={this.updateQuery}
                  />
              </div>}
              <div className='col-sm-8'>
                  <SearchResults
                    searchResults={this.state.searchResults}
                    location={this.props.location}
                  />

                  <Pagination
                    currentIndex={+this.props.location.query.page || 0}
                    maxIndex={10}
                    goToPage={this.goToPage}/>
              </div>
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

function queryToLocation(regionid, regiontype){
  if(!defined(regionid) || !defined(regiontype)) return '';
  return `in ${regiontype}:${regionid}`;
}

Search.contextTypes ={
  router: React.PropTypes.object.isRequired
}


export default Search;
