import React, { Component } from 'react';
// eslint-disable-next-line
import {RouterContext } from 'react-router';
import SearchResults from './SearchResults/SearchResults';
import SearchFilters from './SearchFilters/SearchFilters';
import SearchTabs from './SearchTabs';
import SearchBox from './SearchBox';
import ProgressBar from './ProgressBar';
import debounce from 'lodash.debounce';
import './Search.css';
import getJSON from'./getJSON';
import defined from './defined';
import toggleQuery from './toggleQuery';
import checkActiveOption from './checkActiveOption';

class Search extends Component {
  constructor(props) {
    super(props);
    this.updateSearchText=this.updateSearchText.bind(this);
    this.updateQuery = this.updateQuery.bind(this);
    this.updateProgress = this.updateProgress.bind(this);
    this.transferComplete = this.transferComplete.bind(this);
    this.transferFailed = this.transferFailed.bind(this);
    this.transferCanceled = this.transferCanceled.bind(this);

    this.debouncedSearch = debounce(this.doSearch, 1000);
    this.debouncedGetFacets = debounce(this.getFacets, 150);

    /**
     * @type {Object}
     * @property {Array} searchResults results from search
     * @property {Array} filterPublisher default list of publsihers to display in the publishers facet filter
     * @property {Array} filterTemporal default list of dates to display in the publishers facet filter
     * @property {Array} filterFormat default list of formats to display in the publishers facet filterss
     * @property {Number} loadingProgress the percentage of the search progress
     * @property {Object} userEnteredQuery query returned from natual language processing
     */
    this.state = {
      searchResults: [],
      filterPublisher: [],
      filterTemporal: [],
      filterFormat: [],
      loadingProgress: null,
      userEnteredQuery: {}
    };
  }

  updateSearchText(newText) {
    this.updateQuery({ q: newText });
    this.debouncedGetFacets();
    this.debouncedSearch();
  }

  componentWillMount(){
    if(this.props.location.query.q && this.props.location.query.q.length > 0){
      this.doSearch();
      this.debouncedGetFacets();
    }
  }

  getFacets(){
    let query = this.props.location.query;
    let keyword = query.q.split(' ').join('+');

    getJSON(`http://magda-search-api.terria.io/datasets/search?query=${keyword}`).then((data)=>{
      this.setState({
        filterPublisher: data.facets[0].options,
        filterTemporal: data.facets[1].options,
        filterFormat: data.facets[2].options
      })
    }, (err)=>{console.warn(err)});
  }

  doSearch(){
      let query = this.props.location.query;
      let keyword = query.q.split(' ').join('+');
      this.setState({
        loadingProgress: 0
      })

      // This query will have facets as well
      getJSON(`http://magda-search-api.terria.io/datasets/search?query=${keyword}`,
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
            userEnteredQuery: data.query
          });
          // this.parseQuery(data.query);
        }, (err)=>{console.warn(err)});
  }

  // parseQuery(query){
  //   if(defined(query)){
  //     if(defined(query.publishers)){this.updateQuery({'publishers': mergeQuery(query.publishers, this.props.location.query.publishers)});}
  //     if(defined(query.formats)){this.updateQuery({'formats': mergeQuery(query.formats, this.props.location.query.formats)});}
  //     if(defined(query.dateFrom)){this.updateQuery({'dateFrom': mergeQuery(new Date(query.dateFrom).getFullYear(), this.props.location.query.dateFrom)});}
  //     if(defined(query.dateTo)){this.updateQuery({'dateTo': mergeQuery(new Date(query.dateTo).getFullYear(), this.props.location.query.dateTo)});}
  //   }
  // }


  updateQuery(query){
    this.context.router.push({
      pathname: this.props.location.pathname,
      query: Object.assign(this.props.location.query, query)
    });
    // uncomment this when facet search is activated
    // this.debouncedSearch();
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
    let matchedPublishers = this.state.filterPublisher.filter(p=>p.matched === true);

    let publisherAllowMultiple = true;

    if(matchedPublishers.length > 0 && defined(q.freeText)){
      return <span>Are you searching for <strong>{q.freeText}</strong> published by {matchedPublishers.map((p, i)=>
        <button onClick={this.toggleOption.bind(this, p, publisherAllowMultiple, 'publishers')} className={`${checkActiveOption(p, this.props.location.query.publishers) ? 'is-active' : ''} btn btn-suggested-option`} key={p.value}>{p.value} </button>)} ? </span>;
    }
    if(defined(q.publishers) && q.publishers.length > 0){
      return <span>Oh no, we cannot recgonise <strong>{q.publishers.map(p=>p)}</strong></span>;
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
                    filterPublisher={this.state.filterPublisher}
                    filterTemporal={this.state.filterTemporal}
                    filterFormat={this.state.filterFormat}
                    location={this.props.location}
                    updateQuery={this.updateQuery}
                  />
              </div>}
              <div className='col-sm-8'>
                  <SearchResults
                    searchResults={this.state.searchResults}
                    location={this.props.location}
                    />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
}

Search.contextTypes ={
  router: React.PropTypes.object.isRequired
}


export default Search;
