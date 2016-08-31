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

  render() {
    return (
      <div>
        {this.props.filters.length > 0 &&
        <FilterPublisher filter={this.props.filters[0]}
                         toggleFilter={this.props.toggleFilter}
                         activeFilter ={this.props.activeFilters[0]} />}
      </div>
    );
  }
}
SearchFilters.propTypes = {searchResults: React.PropTypes.array, filters: React.PropTypes.array, activeFilters: React.PropTypes.array};
SearchFilters.defaultProps = {searchResults: [], filters: [], activeFilters: []};

export default SearchFilters;
