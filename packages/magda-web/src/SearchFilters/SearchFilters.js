import React, { Component } from 'react';
import uniq from 'lodash.uniq';
import flattenDeep from'lodash.flattendeep';
import isEqual from 'lodash.isequal';
import Filter from './Filter';
import FilterPublisher from './FilterPublisher';


class SearchFilters extends Component {
  constructor(props) {
    super(props);
  }

  getFilters(key, needsFlatten){

  }

  render() {
    return (
      <div>
        <FilterPublisher conditions={this.getFilters('publisher')} title='publisher'/>
        <Filter conditions={this.getFilters('dateRange')} title='dateRange'/>
        <Filter conditions={this.getFilters('dataFormat', true)} title='dataFormat'/>
      </div>
    );
  }
}
SearchFilters.propTypes = {searchResults: React.PropTypes.array};
SearchFilters.defaultProps = {searchResults: []};

export default SearchFilters;
