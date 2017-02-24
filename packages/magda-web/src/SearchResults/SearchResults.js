import React, { Component } from 'react';
import DatasetSummary from '../Dataset/DatasetSummary';
import './SearchResults.css';

class SearchResults extends Component {
  constructor(props) {
    super(props);
    this.onToggleExpandDataset=this.onToggleExpandDataset.bind(this);
  }

  onToggleExpandDataset(result, event){
    event.stopPropagation();
    let datasetIdentifider = result.identifier;
    this.props.onToggleDataset(datasetIdentifider);
  }

  getSummaryText(){
    if(this.props.searchResults.length){
      if(this.props.strategy === 'match-part'){
        return (
          <div className='search-recomendations__count'>
            The following {this.props.totalNumberOfResults} datasets match some but not all of your search criteria
          </div>);
      } else{
        return (
          <div className='search-results__count'>
            {this.props.totalNumberOfResults} datasets found
          </div>);
      }
    }
    return null;
  }

  render() {
    return (
      <div className='search-results'>
        {this.getSummaryText()}
        <ul className='list-unstyled'>
        {
          this.props.searchResults.filter(result=>this.props.openDataset === result.identifier).map((result, i)=>
            <li key={result.identifier} className='search-results__result'>
              <DatasetSummary dataset={result}
                              onClickDataset={this.onToggleExpandDataset.bind(this, result)}
                              isExpanded={true}
                              onClickTag={this.props.onClickTag}/>
            </li>
          )
        }

        {
          this.props.searchResults.filter(result=>this.props.openDataset !== result.identifier).map((result, i)=>
            <li key={result.identifier} className='search-results__result'>
              <DatasetSummary dataset={result}
                              onClickDataset={this.onToggleExpandDataset.bind(this, result)}
                              isExpanded={this.props.openDataset === result.identifier}
                              onClickTag={this.props.onClickTag}/>
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
