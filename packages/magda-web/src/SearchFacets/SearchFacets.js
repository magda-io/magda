import React, { Component } from 'react';
import {config} from '../config.js';
import './SearchFacets.css';

class SearchFacets extends Component {
  constructor(props) {
    super(props);
    this.state = {openFacet : null};
    this.toggleFacet = this.toggleFacet.bind(this);
    this.closeFacet = this.closeFacet.bind(this);
  }

  componentWillMount(){
    const that = this;
    window.addEventListener("click", that.closeFacet)
  }

  closeFacet(){
    this.setState({
      openFacet: null
    })
  }

  componentWillUnmount(){
    const that = this;
    window.removeEventListener("click", that.closeFacet)
  }
  

  toggleFacet(facet){
    this.setState({
      openFacet: this.state.openFacet === facet ? null : facet
    })
  }

  render() {
    return (
      <div className="row search-facets">
        {config.facets.map(c=>
          <div className="col-sm-3 search-facet" key={c.id} onClick={(ev)=>ev.stopPropagation()}>
            <c.component 
                       updateQuery={this.props.updateQuery}
                       location={this.props.location}
                       component={'facet'}
                       title={c.id}
                       isOpen={this.state.openFacet === c.id}
                       toggleFacet={this.toggleFacet.bind(this, c.id)}/>
          </div>
        )}
      </div>
    );
  }
}

export default SearchFacets;
