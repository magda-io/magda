// eslint-disable-next-line
import {RouterContext } from 'react-router';

import './Search.css';
import {connect} from 'react-redux';
import {config} from '../config.js';
import debounce from 'lodash.debounce';
import defined from '../helpers/defined';
import Pagination from '../UI/Pagination';
import Notification from '../UI/Notification';
import ProgressBar from '../UI/ProgressBar';
import React, { Component } from 'react';
import SearchBox from './SearchBox';
import SearchFacets from '../SearchFacets/SearchFacets';
import Publisher from '../SearchFacets/Publisher';
import SearchResults from '../SearchResults/SearchResults';
import WelcomeText from './WelcomeText';
import MatchingStatus from './MatchingStatus';
import {fetchRegionMapping} from '../actions/regionMapping';
import { bindActionCreators } from "redux";
import { fetchSearchResultsIfNeeded } from '../actions/results';

class Search extends Component {

  constructor(props) {
    super(props);
    this.debounceUpdateSearchQuery = debounce(this.updateSearchText, 3000);
    this.goToPage=this.goToPage.bind(this);
    this.handleSearchFieldEnterKeyPress = this.handleSearchFieldEnterKeyPress.bind(this);
    this.onClickTag = this.onClickTag.bind(this);
    this.updateQuery = this.updateQuery.bind(this);
    this.onDismissError = this.onDismissError.bind(this);
    this.updateSearchText = this.updateSearchText.bind(this);
    this.onClearSearch = this.onClearSearch.bind(this);
    this.onClickSearch = this.onClickSearch.bind(this);
    this.onSearchTextChange = this.onSearchTextChange.bind(this);
    this.onToggleDataset = this.onToggleDataset.bind(this);

    // it needs to be undefined here, so the default value should be from the url
    // once this value is set, the value should always be from the user input
    this.state={
      searchText: undefined
    }
  }

  componentWillMount(){
    this.props.fetchSearchResultsIfNeeded(this.props.location.query);
  }
  

  componentWillReceiveProps(nextProps){
    this.props.fetchSearchResultsIfNeeded(nextProps.location.query);
  }

  onSearchTextChange(text){
    this.setState({
      searchText: text
    });
    this.debounceUpdateSearchQuery(text);
  }

  onClickTag(tag){
    this.setState({
      searchText: tag
    });
    this.updateSearchText(tag);
  }

  /**
   * update only the search text, remove all facets
   */
  updateSearchText(text){
    this.updateQuery({
      q: text,
      publisher: [],
      regionId: undefined,
      regionType: undefined,
      dateFrom: undefined,
      dateTo: undefined,
      format: [],
      page: undefined
    });
  }

  onClearSearch(){
    this.updateSearchText('');
    // cancle any future requests from debounce
    this.debounceUpdateSearchQuery.cancel();
  }

  handleSearchFieldEnterKeyPress(event) {
    // when user hit enter, no need to submit the form
    if(event.charCode===13){
        event.preventDefault();
        this.debounceUpdateSearchQuery.flush();
    }
  }

  /**
   * If the search button is clicked, we do the search immediately
   */
  onClickSearch(){
    this.debounceUpdateSearchQuery.flush();
  }


  /**
   * Pagination
   */
  goToPage(index){
    this.updateQuery({
      page: index
    })
  }

  /**
   * query in this case, is one or more of the params
   * eg: {'q': 'water'}
   */
  updateQuery(query){
    let {router} = this.context;
    router.push({
      pathname: this.props.location.pathname,
      query: Object.assign(this.props.location.query, query)
    });
  }

  onDismissError(){
    // remove all current configurations
    this.updateSearchText('');
  }

  onToggleDataset(datasetIdentifier){
    this.updateQuery({
      open: datasetIdentifier === this.props.location.query.open ? '' : datasetIdentifier
    })
  }

   /**
   * query in this case, is one or more of the params
   * eg: {'q': 'water'}
   */
  updateQuery(query){
    let {router} = this.context;
    router.push({
      pathname: '/search',
      query: Object.assign(this.props.location.query, query)
    });
  }

  render() {
    const searchText = this.props.location.query.q || '';
    return (
      <div>
        {this.props.isFetching && <ProgressBar progress={this.props.progress}/>}
        <div className='search'>
          <div className='search__search-body container'>
          <div className='row'>
            <div className='col-sm-8'>
              {searchText.length > 0 &&
                 <SearchFacets updateQuery={this.updateQuery}
                               location={this.props.location}
                 />
                }
            </div>
          </div>
          <div className='row'>
            <div className='col-sm-8'>
                {searchText.length > 0 &&
                 !this.props.isFetching &&
                 !this.props.hasError &&
                 <div>
                 <Publisher updateQuery={this.updateQuery}
                            component={'recommendations'}
                 />
                 
                 {defined(this.props.location.query.q) &&
                  this.props.location.query.q.length > 0 &&
                    <MatchingStatus datasets={this.props.datasets}
                                    strategy={this.props.strategy}
                    />
                  }

                  <SearchResults
                      strategy={this.props.strategy}
                      searchResults={this.props.datasets}
                      totalNumberOfResults={this.props.hitCount}
                      onClickTag={this.onClickTag}
                      onToggleDataset={this.onToggleDataset}
                      openDataset={this.props.location.query.open}
                  />
                  {this.props.hitCount > 20 &&
                      <Pagination
                        currentPage={+this.props.location.query.page || 1}
                        maxPage={Math.ceil(this.props.hitCount/config.resultsPerPage)}
                        goToPage={this.goToPage}
                      />
                   }
                 </div>
               }
               {!this.props.isFetching && this.props.hasError &&
                  <Notification content={this.props.errorMessage}
                                type='error'
                                onDismiss={this.onDismissError}/>
               }
              </div>
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
  progress: React.PropTypes.number.isRequired,
  hasError: React.PropTypes.bool.isRequired,
  strategy: React.PropTypes.string.isRequired,
  freeText: React.PropTypes.string,
  errorMessage: React.PropTypes.string
}


function mapDispatchToProps(dispatch) {
  return bindActionCreators({
    fetchSearchResultsIfNeeded: fetchSearchResultsIfNeeded,
  }, dispatch);
}


function mapStateToProps(state) {
  let { results } = state;
  return {
    datasets: results.datasets,
    hitCount: results.hitCount,
    isFetching: results.isFetching,
    progress: results.progress,
    hasError: results.hasError,
    strategy: results.strategy,
    errorMessage: results.errorMessage,
    freeText: results.freeText,
  }
}

export default connect(mapStateToProps, mapDispatchToProps)(Search);
