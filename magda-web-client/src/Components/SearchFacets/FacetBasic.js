import React, { Component } from 'react';
import FacetHeader from './FacetHeader';
import find from 'lodash.find';
import maxBy from 'lodash.maxby';
import defined from '../../helpers/defined';
import FacetSearchBox from './FacetSearchBox';
import {config} from '../../config' ;
import ToggleList from '../../UI/ToggleList';
import Button from 'muicss/lib/react/button';
import FacetBasicBody from './FacetBasicBody';

// extends Facet class
class FacetBasic extends Component {
  constructor(props) {
    super(props);
  }

  render(){
    return <div className='facet-wrapper'>
              <FacetHeader
                     isOpen = {this.props.isOpen}
                     title={this.props.title}
                     activeOptions={this.props.activeOptions}
                     hasQuery={this.props.hasQuery}
                     onClick={this.props.toggleFacet}/>
                {this.props.isOpen &&
                  <FacetBasicBody
                    options={this.props.options}
                    activeOptions={this.props.activeOptions}
                    facetSearchResults={this.props.facetSearchResults}
                    onToggleOption={this.props.onToggleOption}
                    onResetFacet={this.props.onResetFacet}
                    searchFacet={this.props.searchFacet}
                  />}
           </div>
  }
}

export default FacetBasic;
