import React, { Component } from 'react';
import {RouterContext } from 'react-router';
import SearchResults from './SearchResults/SearchResults';
import SearchFilters from './SearchFilters/SearchFilters';
import SearchBox from './SearchBox';
import getTemporals from './dummyData/getTemporals';
import getFormats from './dummyData/getFormats';
import getJurisdictions from './dummyData/getJurisdictions';
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
    this.updateQuery = this.updateQuery.bind(this);
    this.debouncedSearch = debounce(this.doSearch, 150);
    this.debouncedGetFacets = debounce(this.getFacets, 150);
    this.state = {
      searchResults: [],
      filters: {
        publisher: [],
        temporal: [],
        jurisdiction: [],
        format: []
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
          publisher: data[0].options,
          temporal: getTemporals(),
          jurisdiction: getJurisdictions(),
          format: getFormats()
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


  updateQuery(query){
    this.context.router.push({
      pathname: this.props.location.pathname,
      query: Object.assign(this.props.location.query, query)
    });
    // uncomment this when facet search is activated
    // this.debouncedSearch();
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
                          location={this.props.location}
                          updateQuery ={this.updateQuery} />
                    </div>}
          <div className='col-sm-8'>
              <SearchResults
                searchResults={this.state.searchResults}
                location={this.props.location}
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
