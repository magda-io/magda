import React, { Component } from 'react';
import DatasetSummary from '../Dataset/DatasetSummary';
import DatasetInfo from '../Dataset/DatasetInfo';
import './SearchResults.css';

class SearchResults extends Component {
  constructor(props) {
    super(props);

    this.clickDataset=this.clickDataset.bind(this);

    this.state={
      expandedItem : null
    }
  }

  clickDataset(result){
    this.setState({
      expandedItem: (this.state.expandedItem === result) ? null : result
    });
  }
  getSummaryText(){
    if(this.props.searchResults.length){
      return (
          <div className='search-results-count'>
            <h4><strong>{this.props.totalNumberOfResults} results found</strong></h4>
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
            <li key={result.title + i}  className='search-result'>
              <DatasetSummary dataset={result} clickDataset={this.clickDataset.bind(this, result)}>
                {this.state.expandedItem === result && <DatasetInfo dataset={result} />}
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
