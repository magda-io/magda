import React, { Component } from 'react';
import DatasetSummary from '../Dataset/DatasetSummary';
import DatasetInfo from '../Dataset/DatasetInfo';
import './SearchResults.css';

class SearchResults extends Component {
  clickDataset(){

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
    return (
      <div className='search-results'>
        {this.getSummaryText()}
        <ul className='list-unstyled'>
        {
          this.props.searchResults.map((result, i)=>
            <li key={result.title + i}>
              <DatasetSummary dataset={result} >
                <DatasetInfo dataset={result} />
              </DatasetSummary>
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
