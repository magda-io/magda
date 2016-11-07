import FacetJurisdiction from './FacetJurisdiction';
import FacetBasic from './FacetBasic';
import React, { Component } from 'react';


class SearchFacets extends Component {

  componentDidMount(){
    let { store } = this.context;
    this.unsubscribe = store.subscribe(()=>
      {this.forceUpdate()}
    )
  }

  componentWillUnmount(){
    this.unsubscribe();
  }

  togglePublisherOption(){
    // update url
    // update redux

  }


  resetPublisherFacet(){
    // update url
    // update redux

  }

  searchPublisherFacet(){

  }


  render() {
    let {store} = this.context;
    let data = store.getState().results.data;
    console.log(store.getState().results);


    return (
      <div>
        <FacetBasic title='publisher'
                    id='publisher'
                    options ={data.facets[0].options}
                    activeOptions={data.query.publishers}
                    facetSearchResults={data.facetPublisherSearchResults}
                    toggleOption={this.togglePublisherOption}
                    onResetFacet={this.resetPublisherFacet}
                    searchFacet={this.searchPublisherFacet}
        />
      </div>
    );
  }
}

SearchFacets.propTypes={updateQuery: React.PropTypes.func};
export default SearchFacets;

SearchFacets.contextTypes ={
  store: React.PropTypes.object
}
