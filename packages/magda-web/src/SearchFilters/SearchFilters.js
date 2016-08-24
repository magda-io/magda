import React, { Component } from 'react';
import uniq from 'lodash.uniq';
import flattenDeep from'lodash.flattendeep';
import isEqual from 'lodash.isequal';
import Filter from './Filter';


class SearchFilters extends Component {
  constructor(props) {
    super(props);
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
        <Filter conditions={this.getFilters('publisher')} title='publisher'/>
        <Filter conditions={this.getFilters('dateRange')} title='dateRange'/>
        <Filter conditions={this.getFilters('dataFormat', true)} title='dataFormat'/>
      </div>
    );
  }
}
SearchFilters.propTypes = {searchResults: React.PropTypes.array};
SearchFilters.defaultProps = {searchResults: []};

export default SearchFilters;
