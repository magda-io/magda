import React, { Component } from 'react';

class SearchResults extends Component {
  render() {
    return (
      <ul className='list-unstyled'>
      {
        this.props.searchResults.map((result, i)=>
          <li key={i} >
          <h3>{result.title}</h3>
          <p>{result.description}</p>
          <ul className='list-unstyled tags'>
            {
              result.tags.map((tag)=>
                <li key={tag}>{tag}</li>
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
