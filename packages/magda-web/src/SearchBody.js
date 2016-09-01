import SearchResults from './SearchResults/SearchResults';
import SearchFilters from './SearchFilters/SearchFilters';

import React, { Component } from 'react';


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


class SearchBody extends Component {
  constructor(props) {
    super(props);
    this.state = {
      searchResults: []
    };
  }

  componentWillMount(){
    this.doSearch();
  }

  componentWillReceiveProps(){
    this.doSearch();
  }

  doSearch(){
    let query = this.props.location.query;
    let q = query.q;
    getJSON('http://default-environment.mrinzybhbv.us-west-2.elasticbeanstalk.com/search/' + q).then((data)=>{
      this.setState({
        searchResults: data.dataSets,
      });
      }, (err)=>{console.warn(err)});
  }

  render() {
    return (
      <div>
        <div className='search-body row'>
          <div className='col-sm-4'>
              <SearchFilters />
          </div>
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
export default SearchBody;
