import React, { Component } from 'react';
import DatasetSummary from '../Dataset/DatasetSummary';
import DatasetInfo from '../Dataset/DatasetInfo';
import './SearchResults.css';

class SearchResults extends Component {
  constructor(props) {
    super(props);

    this.onExpandDataset=this.onExpandDataset.bind(this);
    this.onCloseDataset = this.onCloseDataset.bind(this);

    this.state={
      expandedItem : null
    }
  }

  onExpandDataset(result, event){
    event.stopPropagation();
    this.setState({
      expandedItem: result
    });
  }

  onCloseDataset(){
    this.setState({
      expandedItem: null
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
              <DatasetSummary dataset={result}
                              onClickDataset={this.onExpandDataset.bind(this, result)}
                              isExpanded={this.state.expandedItem === result}
                              onClickTag={this.props.onClickTag}
              />
              <div className={`search-result-dataset-info ${this.state.expandedItem === result ? 'is-open' : ''}`}>
                <DatasetInfo dataset={result} onClickClose={this.onCloseDataset}/>
              </div>
            </li>
          )
        }
        </ul>
      </div>

    );
  }
}
SearchResults.propTypes={searchResults: React.PropTypes.array,
                         onSearchTextChange: React.PropTypes.func
                         };
SearchResults.defaultProps={searchResults: []};

export default SearchResults;
