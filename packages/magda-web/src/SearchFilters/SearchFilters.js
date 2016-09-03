import React, { Component } from 'react';
// import uniq from 'lodash.uniq';
// import flattenDeep from'lodash.flattendeep';
// import isEqual from 'lodash.isequal';
// import Filter from './Filter';
import FilterPublisher from './FilterPublisher';
import FilterDataFormat from './FilterDataFormat';
import FilterDateRange from './FilterDateRange';
import FilterJurisdiction from './FilterJurisdiction';


class SearchFilters extends Component {
  constructor(props) {
    super(props);
  }

  renderFilters(){
      return( 
            <div>
              <FilterPublisher options={this.props.filters.publisher}
                                       title='publisher'
                                       id='publisher'
                                       toggleFilter={this.props.toggleFilter}
                                       location={this.props.location}/>
              <FilterDateRange options={this.props.filters.temporal}
                                       title='date range'
                                       id='temporal'
                                       toggleFilter={this.props.toggleFilter}
                                       location={this.props.location}/>
              <FilterJurisdiction options={this.props.filters.jurisdiction}
                                       title='jurisdiction'
                                       id='jurisdiction'
                                       toggleFilter={this.props.toggleFilter}
                                       location={this.props.location}/>
              <FilterDataFormat options={this.props.filters.format}
                                       title='data format'
                                       id='format'
                                       toggleFilter={this.props.toggleFilter}
                                       location={this.props.location}/>
      
            </div>);
  }

  render() {
    return (
      <div>
      {this.props.location.query.q && this.renderFilters()}
      </div>
    );
  }
}

SearchFilters.propTypes={filters: React.PropTypes.object, toggleFilter: React.PropTypes.func, location: React.PropTypes.object};
SearchFilters.defaultProps={filters: {}};

export default SearchFilters;
