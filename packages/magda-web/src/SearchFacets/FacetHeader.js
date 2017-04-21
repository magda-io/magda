import React, { Component } from 'react';
import './FacetHeader.css';
/**
  * Facet header component, contains a title of the facet and a reset button when there is a active facet
  */
class FacetHeader extends Component {
  render(){
    return (
      <div className='facet-header'>
        <button className='facet-header__title btn'>any {this.props.title}</button>
      </div>
      );
  }
}

FacetHeader.propTypes = {title: React.PropTypes.string,
                        onResetFacet: React.PropTypes.func};
FacetHeader.defaultProps = {title: ''};

export default FacetHeader;
