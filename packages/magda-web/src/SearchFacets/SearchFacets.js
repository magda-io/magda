import FacetJurisdiction from './FacetJurisdiction';
import FacetBasic from './FacetBasic';
import React, { Component } from 'react';
import {connect} from 'react-redux';
import {addPublisher, removePublisher, resetPublisher} from '../actions/actions';
import {fetchPublisherSearchResults} from '../actions/facetPublisherSearch';

class SearchFacets extends Component {
  constructor(props) {
    super(props);
    this.togglePublisherOption = this.togglePublisherOption.bind(this);
    this.resetPublisherFacet = this.resetPublisherFacet.bind(this);
    this.searchPublisherFacet = this.searchPublisherFacet.bind(this);
  }

  togglePublisherOption(publisher){
    let existingPublishers = this.props.activePublishers.map(o=>o.value);
    let index = existingPublishers.indexOf(publisher.value);
    if(index > - 1){
      // dispath an event
      // this.props.dispatch
      this.props.updateQuery({
        publisher: [...existingPublishers.slice(0, index), ...existingPublishers.slice(index+1)]
      })
      // dispatch event to add an active publisher
      this.props.dispatch(removePublisher(publisher));

    } else{
      this.props.updateQuery({
        publisher: [...existingPublishers, publisher.value]
      })
      // dispatch an event to remove an active publisher
      this.props.dispatch(addPublisher(publisher));
    }
  }


  resetPublisherFacet(){
    // update url
    this.props.updateQuery({
      publisher: []
    })

    // update redux
    this.props.dispatch(resetPublisher());

  }

  searchPublisherFacet(facetKeyword){
    this.props.dispatch(fetchPublisherSearchResults(this.props.keyword, facetKeyword))
  }


  render() {
    return (
      <div>
        <FacetBasic title='publisher'
                    id='publisher'
                    options={this.props.publisherOptions}
                    activeOptions={this.props.activePublishers}
                    facetSearchResults={this.props.publisherSearchResults}
                    toggleOption={this.togglePublisherOption}
                    onResetFacet={this.resetPublisherFacet}
                    searchFacet={this.searchPublisherFacet}
        />
      </div>
    );
  }
}

SearchFacets.propTypes={
    updateQuery: React.PropTypes.func,
    publisherOptions: React.PropTypes.array,
    activePublishers: React.PropTypes.array,
    publisherSearchResults: React.PropTypes.array
  };


function mapStateToProps(state) {
  let { results , facetPublisherSearch } = state;
  return {
    publisherOptions: results.data.facets[0].options,
    activePublishers: results.activePublishers,
    activeFormats: results.activeFormats,
    publisherSearchResults: facetPublisherSearch.data.options
  }
}

export default connect(mapStateToProps)(SearchFacets);
