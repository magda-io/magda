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
        <FilterPublisher conditions={this.props.filters.publisher}
                         toggleFilter={this.props.toggleFilter}
                         title='publisher'/>
      </div>
    );
  }
}
SearchFilters.propTypes = {searchResults: React.PropTypes.array, filters: React.PropTypes.object};
SearchFilters.defaultProps = {searchResults: [], filters: {}};

export default SearchFilters;
