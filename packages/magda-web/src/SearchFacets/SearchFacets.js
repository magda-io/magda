import FacetRegion from './FacetRegion';
import FacetBasic from './FacetBasic';
import FacetTemporal from './FacetTemporal';
import React, { Component } from 'react';
import defined from '../helpers/defined';
import Publisher from './Publisher';
import Format from './Format';
import Region from './Region';
import Temporal from './Temporal';

class SearchFacets extends Component {
  render() {
    return (
      <div>
        <Publisher updateQuery={this.props.updateQuery}/>
        <Region updateQuery={this.props.updateQuery}/>
        <Temporal updateQuery={this.props.updateQuery}/>
        <Format updateQuery={this.props.updateQuery}/>
      </div>
    );
  }
}

export default SearchFacets;
