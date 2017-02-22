import React, { Component } from 'react';
import DatasetSummary from '../Dataset/DatasetSummary';
import './SearchResults.css';

class SearchResults extends Component {
  constructor(props) {
    super(props);

    this.onToggleExpandDataset=this.onToggleExpandDataset.bind(this);
    this.onCloseDataset = this.onCloseDataset.bind(this);

    this.state={
      expandedItem : null
    }
  }

  onToggleExpandDataset(result, event){
    event.stopPropagation();
    this.setState({
      expandedItem: this.state.expandedItem === result ? null : result
    });

  }

  onCloseDataset(){
    this.setState({
      expandedItem: null
    });
  }

  getSummaryText(){
    if(this.props.searchResults.length){
      if(this.props.strategy === 'match-part'){
        return (
          <div className='search-recomendations__count'>
            You might find the following {this.props.totalNumberOfResults} related datasets useful
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
          this.props.searchResults.map((result, i)=>
            <li key={result.title + i}  className='search-results__result'>
              <DatasetSummary dataset={result}
                              onClickDataset={this.onToggleExpandDataset.bind(this, result)}
                              isExpanded={this.state.expandedItem === result}
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
