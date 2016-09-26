import React, { Component } from 'react';
import './SearchResults.css';

class SearchResults extends Component {
  truncate(s) {
    return s.substring(0,200) + '...';
  }

  render() {
    return (
      <ul className='list-unstyled'>
      {
        this.props.searchResults.map((result, i)=>
          <li key={i} className='search-result'>
          <h3 className='result-title'><a href={result.landingPage}>{result.title}</a></h3>
          <p>{this.truncate(result.description)}</p>
          <ul className='list-unstyled tags'>
            {
              result.keyword.map((tag)=>
                <li key={tag} className='badge'>{tag}</li>
              )
            }
          </ul>
          </li>
        )
      }
      </ul>

    );
  }
}
SearchResults.propTypes={searchResults: React.PropTypes.array};
SearchResults.defaultProps={searchResults: []};

export default SearchResults;
