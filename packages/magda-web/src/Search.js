import React, { Component } from 'react';
import SearchResults from './SearchResults/SearchResults';
import SearchFilters from './SearchFilters/SearchFilters';
import SearchBox from './SearchBox';
import generateRandomDatasets from './generateRandomDatasets';
import './Search.css';

class Search extends Component {
  constructor(props) {
    super(props);
    this.state = {searchValue: '', results : [], searchResults: []};
    this.updateSearchText = this.updateSearchText.bind(this);
    this.onFilterChange = this.onFilterChange.bind(this);
  }

  updateSearchText(newText) {
    this.setState({searchValue: newText});
    this.doSearch(newText);
  }

  onFilterChange(){

  }

  doSearch(newText){
    let result = generateRandomDatasets(newText);
    // search this.state.searchValue
    this.setState({
      results : result,
      searchResults: result
    });
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
            {this.state.searchResults.length > 0 && <SearchFilters searchResults={this.state.searchResults} />}
          </div>
          <div className='col-sm-8'>
            {this.state.searchResults.length > 0 && <SearchResults searchResults={this.state.searchResults} />}
          </div>
        </div>
      </div>
    );
  }
}

export default Search;
