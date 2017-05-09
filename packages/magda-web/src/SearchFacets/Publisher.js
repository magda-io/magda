import {addPublisher, removePublisher, resetPublisher} from '../actions/results';
import {connect} from 'react-redux';
import {fetchPublisherSearchResults} from '../actions/facetPublisherSearch';
import React, { Component } from 'react';
import FacetBasic from './FacetBasic';
import toggleBasicOption from '../helpers/toggleBasicOption'
import Recommendations from '../Search/Recommendations';

class Publisher extends Component {

  constructor(props) {
    super(props);
    this.onResetPublisherFacet = this.onResetPublisherFacet.bind(this);
    this.onSearchPublisherFacet = this.onSearchPublisherFacet.bind(this);
    this.onTogglePublisherOption = this.onTogglePublisherOption.bind(this);
  }

  onTogglePublisherOption(publisher){
    toggleBasicOption(publisher,
                      this.props.activePublishers,
                      'publisher',
                      removePublisher,
                      addPublisher,
                      this.props.updateQuery,
                      this.props.dispatch);
  }

  onResetPublisherFacet(){
    // update url
    this.props.updateQuery({
      publisher: [],
      page: undefined
    })
    // update redux
    this.props.dispatch(resetPublisher());
  }

  onSearchPublisherFacet(facetKeyword){
    this.props.dispatch(fetchPublisherSearchResults(this.props.location.query.q, facetKeyword))
  }

  render() {
    switch (this.props.component) {
      case 'facet':
        return (
          <FacetBasic title='publisher'
                      id='publisher'
                      hasQuery={Boolean(this.props.activePublishers.length)}
                      options={this.props.publisherOptions}
                      activeOptions={this.props.activePublishers}
                      facetSearchResults={this.props.publisherSearchResults}
                      onToggleOption={this.onTogglePublisherOption}
                      onResetFacet={this.onResetPublisherFacet}
                      searchFacet={this.onSearchPublisherFacet}
                      toggleFacet={this.props.toggleFacet}
                      isOpen={this.props.isOpen}
          />
        );
      case 'recommendations':
        return (
          <Recommendations options={this.props.publisherOptions}
                           onClick={this.onTogglePublisherOption}
                           activeOptions={this.props.activePublishers}
                           description={"Are you searching for items published by "}
          />
        );
      default:
        return null;
      }
  }
}

Publisher.propTypes = {
  publisherOptions: React.PropTypes.array.isRequired,
  activePublishers: React.PropTypes.array.isRequired,
  publisherSearchResults: React.PropTypes.array.isRequired,
  updateQuery: React.PropTypes.func.isRequired,
  toggleFacet: React.PropTypes.func,
  isOpen: React.PropTypes.bool,
}


function mapStateToProps(state) {
  let { results , facetPublisherSearch} = state;
  return {
    publisherOptions: results.publisherOptions,
    activePublishers: results.activePublishers,
    publisherSearchResults: facetPublisherSearch.data
  }
}

export default connect(mapStateToProps)(Publisher);
