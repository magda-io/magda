import React, { Component } from 'react';
import uniq from 'lodash.uniq';
import flattenDeep from'lodash.flattendeep';
import isEqual from 'lodash.isequal';
import Filter from './Filter';


class SearchFilters extends Component {
  constructor(props) {
    super(props);
    this.state ={
      publisher: this.getFilters('publisher'),
      dateRange: this.getFilters('dateRange'),
      dataFormat: this.getFilters('dataFormat', true),
    }
  }

  getFilters(key, needsFlatten){
    if (needsFlatten){
      return uniq(flattenDeep(this.props.searchResults.map((result)=>result[key])));
    }
    return uniq(this.props.searchResults.map((result)=>result[key]));
  }

  render() {
    return (
      <div>
        <Filter conditions={this.state.publisher} title='publisher'/>
        <Filter conditions={this.state.dateRange} title='dateRange'/>
        <Filter conditions={this.state.dataFormat} title='dataFormat'/>
      </div>
    );
  }
}
SearchFilters.propTypes = {searchResults: React.PropTypes.array};
SearchFilters.defaultProps = {searchResults: []};

export default SearchFilters;
