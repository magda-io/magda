import React, { Component } from 'react';
import {RouterContext } from 'react-router';
import SearchResults from './SearchResults/SearchResults';
import SearchFilters from './SearchFilters/SearchFilters';
import SearchBox from './SearchBox';
import getOrganisations from './dummyData/getOrganisations';
import debounce from 'lodash.debounce';
import './Search.css';

let getJSON = function(url) {
  return new Promise(function(resolve, reject) {
    var xhr = new XMLHttpRequest();
    xhr.open('get', url, true);
    xhr.responseType = 'json';
    xhr.onload = function() {
      var status = xhr.status;
      if (status === 200) {
        resolve(xhr.response);
      } else {
        reject(status);
      }
    };
    xhr.send();
  });
};


class Search extends Component {
  constructor(props) {
    super(props);
    this.updateSearchText=this.updateSearchText.bind(this);
    this.debouncedSearch = debounce(this.doSearch, 150);
    this.debouncedGetFacets = debounce(this.getFacets, 150);
    this.toggleFilter = this.toggleFilter.bind(this);
    this.state = {
      searchResults: [],
      filters: {
        publisher: [],
      }
    };
  }

  updateSearchText(newText) {
    this.context.router.push({
      pathname: this.props.location.pathname,
      query: { q: newText },
    });
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
    getJSON(`http://default-environment.mrinzybhbv.us-west-2.elasticbeanstalk.com/search/facets?query=${keyword}`).then((data)=>{
      this.setState({
        filters: {
          publisher: data[0].options
        }
      })
    }, (err)=>{console.warn(err)});
  }

  doSearch(){
      let query = this.props.location.query;
      let keyword = query.q.split(' ').join('+');

      getJSON(`http://default-environment.mrinzybhbv.us-west-2.elasticbeanstalk.com/search?query=${keyword}`).then((data)=>{
        let results= [];
        if(keyword.length > 0){
          results = data.dataSets;
        }
        this.setState({
            searchResults: results,
          });
        }, (err)=>{console.warn(err)});
  }

  toggleFilter(option, filterTitle){
    let currrentFilters;
    // force filters into array
    if (!this.props.location.query[filterTitle]){
      currrentFilters = [];
    }
    else if(Array.isArray(this.props.location.query[filterTitle])){
      currrentFilters = this.props.location.query[filterTitle];
    } else{
      currrentFilters = [this.props.location.query[filterTitle]];
    }
    if(currrentFilters.indexOf(option.id) > -1){
      currrentFilters.splice(currrentFilters.indexOf(option.id), 1);
    } else{
      currrentFilters.push(option.id)
    }

    this.context.router.push({
      pathname: this.props.location.pathname,
      query: Object.assign(this.props.location.query, { [filterTitle]: currrentFilters })
    });

    this.debouncedSearch();
  }

  render() {
    return (
      <div className='search'>
        <div className='search-header jumbotron'>
          <SearchBox searchValue={this.props.location.query.q}
                     updateSearchText={this.updateSearchText}
                     />
        </div>
        <div className='search-body row'>
          {this.props.location.query.q && this.props.location.query.q.length > 0 && <div className='col-sm-4'>
                        <SearchFilters
                          filters={this.state.filters}
                          toggleFilter={this.toggleFilter}
                          location={this.props.location}/>
                    </div>}
          <div className='col-sm-8'>
              <SearchResults
                searchResults={this.state.searchResults}
                />
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
