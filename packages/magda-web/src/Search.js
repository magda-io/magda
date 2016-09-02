import React, { Component } from 'react';
import { browserHistory, RouterContext } from 'react-router';
import SearchResults from './SearchResults/SearchResults';
import SearchFilters from './SearchFilters/SearchFilters';
import SearchBox from './SearchBox';
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
    this.state = {
      searchResults: []
    };
  }

  updateSearchText(newText) {
    this.context.router.push({
      pathname: this.props.location.pathname,
      query: { q: newText },
    });
    this.doSearch(newText);
  }

  componentWillMount(){
    if(this.props.location.query.q && this.props.location.query.q.length > 0){
      this.doSearch(this.props.location.query.q);
    }
  }

  doSearch(newText){
    console.log(newText);

      getJSON(`http://default-environment.mrinzybhbv.us-west-2.elasticbeanstalk.com/search/${newText}`).then((data)=>{
      this.setState({
        searchResults: data.dataSets,
      });
      }, (err)=>{
        console.warn(err);
        this.setState({
          searchResults: [],
        });
    });
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

Search.contextTypes ={
  router: React.PropTypes.object.isRequired
}
export default Search;
