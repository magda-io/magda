import {addFormat, removeFormat, resetFormat} from '../../actions/datasetSearchActions';
import {connect} from 'react-redux';
import {fetchFormatSearchResults} from '../../actions/facetFormatSearchActions';
import React, { Component } from 'react';
import FacetBasic from './FacetBasic';
import toggleBasicOption from '../../helpers/toggleBasicOption'
import queryString from 'query-string';

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
    this.props.toggleFacet();
    // update redux
    this.props.dispatch(resetFormat());
  }

  onSearchFormatFacet(facetKeyword){
    this.props.dispatch(fetchFormatSearchResults(queryString.parse(this.props.location.search).q, facetKeyword))
  }

  render() {
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
  }
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
