import FilterDataFormat from './FilterDataFormat';
import FilterDateRange from './FilterDateRange';
import FilterJurisdiction from './FilterJurisdiction';
import FilterPublisher from './FilterPublisher';
import React, { Component } from 'react';


class SearchFilters extends Component {
  renderFilters(){
    let mainSearchWord = encodeURI(this.props.location.query.q);
      return(
            <div>
              <FilterPublisher options={this.props.filterPublisher}
                               title='publisher'
                               id='publishers'
                               location={this.props.location}
                               updateQuery={this.props.updateQuery}
                               facetSearchQueryBase={`http://magda-search-api.terria.io/facets/publisher/options/search?generalQuery=${mainSearchWord}&facetQuery=`}/>

              <FilterJurisdiction title='location'
                                  id='jurisdiction'
                                  location={this.props.location}
                                  updateQuery={this.props.updateQuery}
                                  facetSearchQueryBase={null}/>

              <FilterDateRange options={this.props.filterTemporal}
                                       title='date range'
                                       id='temporal'
                                       location={this.props.location}
                                       updateQuery={this.props.updateQuery}
                                       facetSearchQueryBase={null}/>

              <FilterDataFormat options={this.props.filterFormat}
                                       title='data format'
                                       id='formats'
                                       location={this.props.location}
                                       updateQuery={this.props.updateQuery}
                                       facetSearchQueryBase={`http://magda-search-api.terria.io/facets/formatoptions/search?generalQuery=${mainSearchWord}&facetQuery=`}/>

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
