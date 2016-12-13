import {addFormat, removeFormat, resetFormat} from '../actions/results';
import {connect} from 'react-redux';
import {fetchFormatSearchResults} from '../actions/facetFormatSearch';
import ProgressBar from '../UI/ProgressBar';
import React, { Component } from 'react';
import FacetBasic from './FacetBasic';
import toggleBasicOption from '../helpers/toggleBasicOption'

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
      />
    );
  }
}

Format.propTypes = {
  formatOptions: React.PropTypes.array.isRequired,
  activeFormats: React.PropTypes.array.isRequired,
  formatSearchResults: React.PropTypes.array.isRequired,
  updateQuery: React.PropTypes.func.isRequired
}


function mapStateToProps(state) {
  let { results , facetFormatSearch} = state;
  return {
    formatOptions: results.formatOptions,
    activeFormats: results.activeFormats,
    formatSearchResults: facetFormatSearch.data
  }
}

export default connect(mapStateToProps)(Format);
