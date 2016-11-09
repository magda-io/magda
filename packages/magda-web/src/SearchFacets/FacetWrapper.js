import './FacetWrapper.css';
import React, { Component } from 'react';
import FacetHeader from './FacetHeader';

/**
  * Facet Facet component, for example, publisher facet, location facet, format facet, temporal facet
  */
class FacetWrapper extends Component {
  render() {
    return (
      <div className='facet-wrapper'>
        <FacetHeader onResetFacet={this.props.onResetFacet}
                     title={this.props.title}
                     activeOptions={this.props.activeOptions}
                     hasQuery={this.props.hasQuery}/>
        {this.props.children}
      </div>
    );
  }
}

FacetWrapper.propTypes = {title: React.PropTypes.string,
                          onResetFacet: React.PropTypes.func};

export default FacetWrapper;
