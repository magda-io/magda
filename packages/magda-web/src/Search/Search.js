import React, { Component } from 'react';
import {fetchSearchResultsIfNeeded} from '../actions/results';
import {connect} from 'react-redux';
import './Search.css';
// eslint-disable-next-line
import {RouterContext } from 'react-router';
// eslint-disable-next-line
import Pagination from '../UI/Pagination';
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
    this.props.dispatch(fetchSearchResultsIfNeeded(this.props.location.query));
  }


  componentDidMount(){
    //
  }

  componentWillReceiveProps(nextProps){
    this.props.dispatch(fetchSearchResultsIfNeeded(this.props.location.query));
  }

  onSearchTextChange(text){
    this.updateQuery({
      q: text,
      publisher: [],
      regionId: [],
      regionCode: [],
      dateFrom: undefined,
      dateTo: undefined,
      format: []
    });
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
        {this.props.isFetching && <ProgressBar/>}
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
                {!this.props.isFetching && <div>
                  <SearchResults
                      searchResults={this.props.datasets}
                      totalNumberOfResults={this.props.hitCount}
                  />
                  {this.props.hitCount > 20 &&
                      <Pagination
                        currentPage={+this.props.location.query.page || 1}
                        maxPage={Math.ceil(this.props.hitCount/20)}
                        goToPage={this.goToPage}
                      />
                   }
                 </div>
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
}


function mapStateToProps(state) {
  let { results } = state;
  return {
    datasets: results.datasets,
    hitCount: results.hitCount,
    isFetching: results.isFetching,
  }
}

export default connect(mapStateToProps)(Search);
