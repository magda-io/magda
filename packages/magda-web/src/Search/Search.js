import React, { Component } from 'react';
import {fetchSearchResults, setUrlQuery} from '../actions/results';
import {connect} from 'react-redux';
import parseQuery from '../helpers/parseQuery';

import './Search.css';
// eslint-disable-next-line
import {RouterContext } from 'react-router';
// eslint-disable-next-line
import Pagination from '../UI/Pagination';
// eslint-disable-next-line
import ProgressBar from '../UI/ProgressBar';
import SearchBox from './SearchBox';
import SearchFacets from '../SearchFacets/SearchFacets';
import SearchResults from '../SearchResults/SearchResults';

class Search extends Component {

  constructor(props) {
    super(props);
    this.updateQuery = this.updateQuery.bind(this);
    this.onSearchTextChange = this.onSearchTextChange.bind(this);
    this.goToPage=this.goToPage.bind(this);
  }

  componentWillMount(){
    let urlQuery = parseQuery(this.props.location.query);
    // copy url into states
    this.props.dispatch(setUrlQuery(urlQuery, this.props.dispatch));
  }


  componentDidMount(){
    // this.props.dispatch(fetchSearchResults(this.props.location.query.q))
  }

  componentWillReceiveProps(nextProps){
    let nextQuery = parseQuery(nextProps.location.query);
    let currentQuery = nextProps.urlQuery;

    // need to move this logic into reducer
    if(nextQuery !== currentQuery){
      this.props.dispatch(setUrlQuery(nextQuery, this.props.dispatch));
    }
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
              <SearchBox preloadedSearchText={this.props.location.query.q || ''} updateQuery={this.updateQuery} onSearchTextChange={this.onSearchTextChange}/>
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
                {
                    // this is broken
                    (this.props.hitCount > 20) &&
                    <Pagination
                      currentPage={+this.props.location.query.page || 1}
                      maxPage={Math.ceil(this.props.hitCount/20)}
                      goToPage={this.goToPage}/>
                 }
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
  dispatch: React.PropTypes.func.isRequired,
  urlQuery: React.PropTypes.string
}


function mapStateToProps(state) {
  let { results } = state;
  return {
    datasets: results.datasets,
    hitCount: results.hitCount,
    isFetching: results.isFetching,
    urlQuery: results.urlQuery
  }
}

export default connect(mapStateToProps)(Search);
