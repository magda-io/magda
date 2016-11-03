import React, { Component } from 'react';
import defined from '../helpers/defined';
import './FacetHeader.css';
/**
  * Facet header component, contains a title of the facet and a reset button when there is a active facet
  */
class FacetHeader extends Component {
  hasQuery(){
    if(defined(this.props.activeOptions) && this.props.activeOptions.length > 0){
      return true;
    }
    return false;
  }

  render(){
    return (
      <div className='clearfix facet-header'>
        <h4 className='facet-title'>{this.props.title}</h4>
        {this.hasQuery() && <button type='button'
                                    className='btn btn-reset'
                                    onClick={()=>{this.props.resetFacet()}}>Reset</button>}

      </div>
      );
  }
}

FacetHeader.propTypes = {title: React.PropTypes.string,
                          resetFacet: React.PropTypes.func,
                        activeOptions: React.PropTypes.array};
FacetHeader.defaultProps = {title: ''};

export default FacetHeader;
