import React, { Component } from 'react';
import {config} from '../../config' ;
import './SearchFacets.css';

class SearchFacets extends Component {
  constructor(props) {
    super(props);
    this.state = {openFacet : null};
    this.toggleFacet = this.toggleFacet.bind(this);
    this.closeFacetWithKeyBoard = this.closeFacetWithKeyBoard.bind(this);
  }

  componentWillMount(){
    const that = this;
    window.addEventListener('click', that.closeFacetWithKeyBoard);
  }

  closeFacetWithKeyBoard(event){
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
    window.removeEventListener('click', that.closeFacetWithKeyBoard);
  }


  toggleFacet(facet){
    this.setState({
      openFacet: this.state.openFacet === facet ? null : facet
    })
  }

  closeFacet(facet){
    if(this.state.openFacet === facet){
      this.setState({
        openFacet: null
      })
    }
    return false
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
                       toggleFacet={this.toggleFacet.bind(this, c.id)}
                       closeFacet={this.closeFacet.bind(this, c.id)}/>
          </div>
        )}
      </div>
    );
  }
}

export default SearchFacets;
