import React, { Component } from 'react';
import SearchResults from './SearchResults/SearchResults';
import SearchFilters from './SearchFilters/SearchFilters';
import SearchBox from './SearchBox';
import generateRandomDatasets from './generateRandomDatasets';
import getOrganisations from './dummyData/getOrganisations';
import find from 'lodash.find';
import remove from 'lodash.remove';
import './Search.css';

class Search extends Component {
  constructor(props) {
    super(props);
    this.state = {
      searchValue: '',
      results : [],
      searchResults: [],
      filters: [],
      // get this from url
      activeFilters: [{id: 'publisher', options: []}]
    };
    this.updateSearchText = this.updateSearchText.bind(this);
    this.onFilterChange = this.onFilterChange.bind(this);
    this.toggleFilter = this.toggleFilter.bind(this);
  }

  updateSearchText(newText) {
    this.setState({searchValue: newText});
    this.doSearch(newText);
  }

  onFilterChange(){

  }

  toggleFilter(option, i, filterId){
    let activeFilters = this.state.activeFilters;
    let filterToUpdate = find(activeFilters, f=> f.id = filterId).options;
    let filterState = find(filterToUpdate, (f)=>f.id === option.id);
    if(!filterState){
      filterToUpdate.push(option);
    }else{
      remove(filterToUpdate, f=>f.id === option.id)
    }
    this.setState({
      activeFilters: activeFilters
    });
  }

  doSearch(newText){
    getJSON('http://default-environment.mrinzybhbv.us-west-2.elasticbeanstalk.com/search/' + newText).then((data)=>{
    this.setState({
      results : data.dataSets,
      searchResults: data.dataSets,
      filters: data.facets
    });
    }, (err)=>{console.warn(err)});
  }

  render() {
    return (
      <div className='search'>
        <div className='search-header jumbotron'>
          <SearchBox updateSearchText={this.updateSearchText}
                     searchValue={this.state.searchValue}/>
        </div>
        <div className='search-body row'>
          <div className='col-sm-4'>
            {this.state.searchValue.length > 0 &&
              <SearchFilters
                searchResults={this.state.searchResults}
                filters={this.state.filters}
                toggleFilter={this.toggleFilter}
                activeFilters={this.state.activeFilters} />}
          </div>
          <div className='col-sm-8'>
            {this.state.searchValue.length > 0 &&
              <SearchResults
                searchResults={this.state.searchResults} />}
          </div>
        </div>
      </div>
    );
  }
}


let getJSON = function(url) {
  return new Promise(function(resolve, reject) {
    var xhr = new XMLHttpRequest();
    xhr.open('get', url, true);
    xhr.responseType = 'json';
    xhr.onload = function() {
      var status = xhr.status;
      if (status == 200) {
        resolve(xhr.response);
      } else {
        reject(status);
      }
    };
    xhr.send();
  });
};

export default Search;
