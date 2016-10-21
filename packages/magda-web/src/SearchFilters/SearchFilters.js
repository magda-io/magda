import FilterDataFormat from './FilterDataFormat';
import FilterDateRange from './FilterDateRange';
import FilterJurisdiction from './FilterJurisdiction';
import FilterPublisher from './FilterPublisher';
import React, { Component } from 'react';


class SearchFilters extends Component {
  renderFilters(){
      return(
            <div>
              <FilterPublisher options={this.props.filterPublisher}
                               title='publisher'
                               id='publishers'
                               location={this.props.location}
                               updateQuery={this.props.updateQuery}/>

              <FilterJurisdiction title='location'
                                  id='jurisdiction'
                                  location={this.props.location}
                                  updateQuery={this.props.updateQuery}/>

              <FilterDateRange options={this.props.filterTemporal}
                                       title='date range'
                                       id='temporal'
                                       location={this.props.location}
                                       updateQuery={this.props.updateQuery}/>

              <FilterDataFormat options={this.props.filterFormat}
                                       title='data format'
                                       id='formats'
                                       location={this.props.location}
                                       updateQuery={this.props.updateQuery}/>

            </div>);
  }

  render() {
    // only displays the facet filters if there is a search keyword
    return (
      <div>
        {this.props.location.query.q && this.renderFilters()}
      </div>
    );
  }
}

SearchFilters.propTypes={filters: React.PropTypes.object,
                         toggleOption: React.PropTypes.func,
                         location: React.PropTypes.object,
                         updateQuery: React.PropTypes.func};
SearchFilters.defaultProps={filters: {}};

export default SearchFilters;
