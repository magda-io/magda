import React, { Component } from 'react';
import {fetchSearchResults} from '../actions/results';
import {connect} from 'react-redux';

import './Search.css';
// eslint-disable-next-line
import {RouterContext } from 'react-router';
import defined from '../helpers/defined';
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

  }


  componentDidMount(){
    this.props.dispatch(fetchSearchResults(this.props.location.query.q))
  }

  componentWillReceiveProps(){
    // should any updates happen here?
  }

  onSearchTextChange(text){
    this.updateQuery({q: text});
    this.props.dispatch(fetchSearchResults(text))
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
    return (
      <div>
        <div className='search'>
          <div className='search__search-header'>
            <div className='container'>
              <SearchBox preloadedSearchText = {this.props.location.query.q || ''} updateQuery={this.updateQuery} onSearchTextChange={this.onSearchTextChange}/>
            </div>
          </div>
          <div className='search__search-body'>
            <div className='col-sm-4'>
                <SearchFacets updateQuery={this.updateQuery} keyword={this.props.location.query.q}/>
            </div>
            <div className='col-sm-8'>
                <SearchResults
                    searchResults={this.props.datasets}
                    totalNumberOfResults={this.props.hitCount}
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
}

Search.propTypes = {
  datasets: React.PropTypes.array.isRequired,
  hitCount: React.PropTypes.number.isRequired,
  isFetching: React.PropTypes.bool.isRequired,
  dispatch: React.PropTypes.func.isRequired
}


function mapStateToProps(state) {
  let { results } = state;
  return {
    datasets: results.datasets,
    hitCount: results.hitCount,
    isFetching: results.isFetching,
    query: results.query
  }
}

export default connect(mapStateToProps)(Search);
