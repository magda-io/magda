import React, { Component } from 'react';
import {config} from '../../config' ;
import Button from 'muicss/lib/react/button';
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
    window.addEventListener('click', that.closeFacet);
    window.addEventListener('keyup', that.closeFacet);
  }

  closeFacet(event){
    if(event.keyCode){
      if(event.keyCode === 27){
        this.setState({
          openFacet: null
        })
      } else {
        return false
      }
    } else{
      this.setState({
        openFacet: null
      })
    }

  }

  componentWillUnmount(){
    const that = this;
    window.removeEventListener('click', that.closeFacet);
    window.removeEventListener('keyup', that.closeFacet);
  }


  toggleFacet(facet){
    this.setState({
      openFacet: this.state.openFacet === facet ? null : facet
    })
  }

  render() {
    return (
      <div className='search-facets clearfix'>
        {config.facets.map(c=>
          <div className='search-facet' key={c.id} onClick={(ev)=>ev.stopPropagation()}>
            <c.component
                       updateQuery={this.props.updateQuery}
                       location={this.props.location}
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
