import React, { Component } from 'react';
import {fetchSearchResults} from '../actions/actions';

import './Search.css';
// eslint-disable-next-line
import {RouterContext } from 'react-router';
import debounce from 'lodash.debounce';
import defined from '../helpers/defined';
import find from 'lodash.find';
import findindex from 'lodash.findindex';
import Pagination from '../UI/Pagination';
import ProgressBar from '../UI/ProgressBar';
import SearchBox from './SearchBox';
import SearchFacets from '../SearchFacets/SearchFacets';
import SearchResults from '../SearchResults/SearchResults';

const NUMBERRESULTSPERPAGE = 20;

const SETTINGS ={
  resultsPerPage: 20,
  optionsVisible: 5,
  facets: ['publisher', 'regionId', 'regionType', 'dateTo', 'dateFrom', 'format'],
  publisherAllowMultiple: true,
  formatAllowMultiple: true,
  regionTypeAllowMultiple: false,
  regionIdAllowMultiple: false,
  dateToAllowMultiple: false,
  dateFromAllowMultiple: false
}


class Search extends Component {

  constructor(props) {
    super(props);
    this.updateQuery = this.updateQuery.bind(this);
    this.onSearchTextChange = this.onSearchTextChange.bind(this);
  }

  componentWillMount(){
    if(defined(this.props.location.query.q) && this.props.location.query.q.length > 0){
      let {store} = this.context;
      store.dispatch(fetchSearchResults(this.props.location.query.q))
    }
  }


  componentDidMount(){
    let { store } = this.context;
    this.unsubscribe = store.subscribe(()=> this.forceUpdate);
  }

  componentWillUnmount(){
    this.unsubscribe();
  }

  onSearchTextChange(text){
    this.updateQuery({q: text});
    // do search in redux
    let {store} = this.context;
    store.dispatch(fetchSearchResults(text))
  }

  goToPage(index){
    this.updateQuery({
      page: index
    })
  }

  updateQuery(query){
    let {router} = this.context;
    router.push({
      pathname: this.props.location.pathname,
      query: Object.assign(this.props.location.query, query)
    });
  }


  render() {
    let { store } = this.context;
    console.log(store.getState());

    return (
      <div>
        <div className='search'>
          <div className='search__search-header'>
            <div className='container'>
              <SearchBox value = {this.props.location.query.q} updateQuery={this.updateQuery} onSearchTextChange={this.onSearchTextChange}/>
            </div>
          </div>
          <div className='search__search-body'>
            <div className='col-sm-4'>
              {defined(store.getState().results.data.facets) && <SearchFacets />}
            </div>
            <div className='col-sm-8'>
                <SearchResults
                    searchResults={store.getState().results.data.dataSets}
                    totalNumberOfResults={store.getState().results.data.hitCount}
                />
            </div>
          </div>
        </div>
      </div>
    );
  }
}

Search.contextTypes ={
  router: React.PropTypes.object.isRequired,
  store: React.PropTypes.object
}


export default Search;
