import React, { Component } from 'react';
import './SearchResults.css';

class SearchResults extends Component {
  truncate(s) {
    return s.substring(0,200) + '...';
  }

  getSummaryText(){
    if(this.props.searchResults.length){
      return (
          <div className='search-results-count'>
            <h4><strong>{this.props.searchResults.length} results found</strong></h4>
          </div>);
    }
    return null;
  }

  render() {
    console.log(this.props.searchResults);
    return (
      <div className='search-results'>
        {this.getSummaryText()}
        <ul className='list-unstyled'>
        {
          this.props.searchResults.map((result, i)=>
            <li key={i} className='search-result'>
            <h3 className='result-title'><a href={result.landingPage}>{result.title}</a></h3>
            <label className='search-result--publisher'><i className='fa fa-book' aria-hidden='true'></i>{result.publisher.name}</label>
            <p>{this.truncate(result.description)}</p>
            <ul className='list-unstyled tags'>
              {
                result.keyword.map((tag)=>
                  <li key={tag} className='search-result--tag'><a href='#'>#{tag}</a></li>
                )
              }
            </ul>
            </li>
          )
        }
        </ul>
      </div>

    );
  }
}
SearchResults.propTypes={searchResults: React.PropTypes.array};
SearchResults.defaultProps={searchResults: []};

export default SearchResults;
