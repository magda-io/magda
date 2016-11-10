import React, { Component } from 'react';
import './FacetHeader.css';
/**
  * Facet header component, contains a title of the facet and a reset button when there is a active facet
  */
class FacetHeader extends Component {

  renderResetButton(){
    if(this.props.hasQuery){
      return <button type='button'
                     className='btn btn-reset'
                     onClick={()=>{this.props.onResetFacet()}}>
                     Reset
              </button>
    }
    return null;
  }

  render(){

    return (
      <div className='clearfix facet-header'>
        <h4 className='facet-title'>{this.props.title}</h4>
        {this.renderResetButton()}
      </div>
      );
  }
}

FacetHeader.propTypes = {title: React.PropTypes.string,
                        onResetFacet: React.PropTypes.func};
FacetHeader.defaultProps = {title: ''};

export default FacetHeader;
