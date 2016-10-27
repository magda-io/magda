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
              <FilterPublisher options={this.props.filterPublisherOptions}
                               activeOptions={this.props.activePublisherOptions}
                               title='publisher'
                               id='publisher'
                               location={this.props.location}
                               updateQuery={this.props.updateQuery}
                               facetSearchQueryBase={`http://magda-search-api.terria.io/facets/publisher/options/search?generalQuery=${mainSearchWord}&facetQuery=`}/>

              <FilterJurisdiction title='location'
                                  id='jurisdiction'
                                  location={this.props.location}
                                  updateQuery={this.props.updateQuery}
                                  facetSearchQueryBase={null}/>

              <FilterDateRange options={this.props.filterTemporalOptions}
                                       title='date range'
                                       id='temporal'
                                       location={this.props.location}
                                       updateQuery={this.props.updateQuery}
                                       facetSearchQueryBase={null}/>

              <FilterDataFormat options={this.props.filterFormatOptions}
                                activeOptions={this.props.activeFormatOptions}
                                title='data format'
                                id='format'
                                location={this.props.location}
                                updateQuery={this.props.updateQuery}
                                facetSearchQueryBase={`http://magda-search-api.terria.io/facets/format/options/search?generalQuery=${mainSearchWord}&facetQuery=`}/>

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
