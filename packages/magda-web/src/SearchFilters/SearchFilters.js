import React, { Component } from 'react';
// import uniq from 'lodash.uniq';
// import flattenDeep from'lodash.flattendeep';
// import isEqual from 'lodash.isequal';
// import Filter from './Filter';
import FilterPublisher from './FilterPublisher';


class SearchFilters extends Component {
  constructor(props) {
    super(props);
  }
  render() {
    return (
      <div>
        <FilterPublisher options = {this.props.filters.publisher}
                         title='publisher'
                         toggleFilter={this.props.toggleFilter}
                         location={this.props.location}/>
      </div>
    )
  }
}
SearchFilters.propTypes={filters: React.PropTypes.object, toggleFilter: React.PropTypes.func};
SearchFilters.defaultProps={filters: {}};

export default SearchFilters;
