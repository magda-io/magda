import React, { Component } from 'react';
import DatasetSummary from '../DatasetSummary';
import './SearchResults.css';
import defined from '../defined';

class SearchResults extends Component {
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
    return (
      <div className='search-results'>
        {this.getSummaryText()}
        <ul className='list-unstyled'>
        {
          this.props.searchResults.map((result, i)=>
            <li key = {result.title}>
              <DatasetSummary dataset={result}/>
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
