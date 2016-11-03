import './FacetWrapper.css';
import React, { Component } from 'react';
import FacetHeader from './FacetHeader';

/**
  * Facet Facet component, for example, publisher facet, location facet, format facet, temporal facet
  */
class FacetWrapper extends Component {
  constructor(props) {
    super(props);
  }
  render() {
    return (
      <div className='facet-wrapper'>
        <FacetHeader resetFacet={this.props.resetFacet}
                     title={this.props.title}
                     activeOptions={this.props.activeOptions}/>
        {this.props.children}
      </div>
    );
  }
}

FacetWrapper.propTypes = {title: React.PropTypes.string,
                          resetFacet: React.PropTypes.func};

export default FacetWrapper;
