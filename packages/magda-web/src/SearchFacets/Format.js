import {addFormat, removeFormat, resetFormat} from '../actions/datasetSearchActions';
import {connect} from 'react-redux';
import {fetchFormatSearchResults} from '../actions/facetFormatSearchActions';
import React, { Component } from 'react';
import FacetBasic from './FacetBasic';
import toggleBasicOption from '../helpers/toggleBasicOption'
import Recommendations from '../Search/Recommendations';

class Format extends Component {

  constructor(props) {
    super(props);
    this.onResetFormatFacet = this.onResetFormatFacet.bind(this);
    this.onSearchFormatFacet = this.onSearchFormatFacet.bind(this);
    this.onToggleFormatOption = this.onToggleFormatOption.bind(this);
  }

  onToggleFormatOption(format){
    toggleBasicOption(format,
                      this.props.activeFormats,
                      'format',
                      removeFormat,
                      addFormat,
                      this.props.updateQuery,
                      this.props.dispatch);
  }

  onResetFormatFacet(){
    // update url
    this.props.updateQuery({
      format: [],
      page: undefined
    })
    // update redux
    this.props.dispatch(resetFormat());
  }

  onSearchFormatFacet(facetKeyword){
    this.props.dispatch(fetchFormatSearchResults(this.props.location.query.q, facetKeyword))
  }

  render() {
    switch (this.props.component) {
      case 'facet':
        return (
          <FacetBasic title='format'
                      id='format'
                      hasQuery={Boolean(this.props.activeFormats.length)}
                      options={this.props.formatOptions}
                      activeOptions={this.props.activeFormats}
                      facetSearchResults={this.props.formatSearchResults}
                      onToggleOption={this.onToggleFormatOption}
                      onResetFacet={this.onResetFormatFacet}
                      searchFacet={this.onSearchFormatFacet}
                      toggleFacet={this.props.toggleFacet}
                      isOpen={this.props.isOpen}
          />
        );
      case 'recommendations':
        return (
          <Recommendations options={this.props.formatOptions}
                           onClick={this.onToggleFormatOption}
                           activeOptions={this.props.activeFormats}
                           description={"Are you searching for items in the following format "}
          />
        );
      default:
        return null;
      }
  }
}

Format.propTypes = {
  formatOptions: React.PropTypes.array.isRequired,
  activeFormats: React.PropTypes.array.isRequired,
  formatSearchResults: React.PropTypes.array.isRequired,
  updateQuery: React.PropTypes.func.isRequired,
  toggleFacet: React.PropTypes.func.isRequired,
  isOpen: React.PropTypes.bool.isRequired,
}


function mapStateToProps(state) {
  let { datasetSearch , facetFormatSearch} = state;
  return {
    formatOptions: datasetSearch.formatOptions,
    activeFormats: datasetSearch.activeFormats,
    formatSearchResults: facetFormatSearch.data
  }
}

export default connect(mapStateToProps)(Format);
