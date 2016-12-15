// eslint-disable-next-line
import {RouterContext } from 'react-router';

import './Search.css';
import {connect} from 'react-redux';
import config from '../config.js';
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
import NoMatching from './NoMatching';
import {fetchRegionMapping} from '../actions/regionMapping';


class Search extends Component {

  constructor(props) {
    super(props);
    this.debounceUpdateSearchQuery = debounce(this.updateSearchQuery, 3000);
    this.goToPage=this.goToPage.bind(this);
    this.handleSearchFieldEnterKeyPress = this.handleSearchFieldEnterKeyPress.bind(this);
    this.onClickTag = this.onClickTag.bind(this);
    this.updateQuery = this.updateQuery.bind(this);
    this.onDismissError = this.onDismissError.bind(this);
    this.modifyUserSearchString = this.modifyUserSearchString.bind(this);
    this.updateSearchQuery = this.updateSearchQuery.bind(this);
    this.onClearSearch = this.onClearSearch.bind(this);
    this.onClickSearch = this.onClickSearch.bind(this);
    this.onSearchTextChange = this.onSearchTextChange.bind(this);

    // it needs to be undefined here, so the default value should be from the url
    // once this value is set, the value should always be from the user input
    this.state={
      searchText: undefined
    }
  }

  componentWillMount(){
    this.props.dispatch(fetchRegionMapping());
  }

  componentWillReceiveProps(nextProps){
    this.setState({
      searchText: nextProps.location.query.q
    })
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
    this.updateSearchQuery(tag);
  }


  updateSearchQuery(text){
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
    this.updateSearchQuery('');
    this.debounceUpdateSearchQuery.cancel();
  }

  handleSearchFieldEnterKeyPress(event) {
    // when user hit enter, no need to submit the form
    if(event.charCode===13){
        event.preventDefault();
        this.debounceUpdateSearchQuery.flush();
    }
  }

  onClickSearch(){
    this.debounceUpdateSearchQuery.flush();
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

  getSearchBoxValue(){
    if(defined(this.state.searchText)){
      return this.state.searchText;
    } else if(defined(this.props.location.query.q)){
      return this.props.location.query.q
    }
    return '';
  }

  modifyUserSearchString(additionalString){
    let base = this.props.freeText;
    this.updateQuery({
      q: `${base} ${additionalString}`
    })
  }

  onDismissError(){
    this.updateSearchQuery('');
  }

  render() {
    return (
      <div>
        {this.props.isFetching && <ProgressBar progress={this.props.progress}/>}
        <div className='search'>
          <div className='search__search-header'>
            <div className='container'>
              <div className='row'>
              <div className='col-sm-8 col-sm-offset-4'>
                <SearchBox value={this.getSearchBoxValue()}
                           onChange={this.onSearchTextChange}
                           onKeyPress={this.handleSearchFieldEnterKeyPress}
                           onClearSearch={this.onClearSearch}
                           onClickSearch={this.onClickSearch}/>
                {this.getSearchBoxValue().length === 0 &&
                  <WelcomeText onClick={this.updateSearchQuery}/>
                }
              </div>
            </div>
          </div>
          </div>
          <div className='search__search-body container'>
          <div className='row'>
            <div className='col-sm-4 hidden-xs'>
                {this.getSearchBoxValue().length > 0 &&
                 <SearchFacets updateQuery={this.updateQuery}
                               modifyUserSearchString={this.modifyUserSearchString}
                 />
                }
            </div>
            <div className='col-sm-8'>
                {this.getSearchBoxValue().length > 0 &&
                 !this.props.isFetching &&
                 !this.props.hasError &&
                 <div>
                 <Publisher updateQuery={this.updateQuery}
                            modifyUserSearchString={this.modifyUserSearchString}
                            component={'recomendations'}
                 />

                 {defined(this.props.location.query.q) &&
                  this.props.location.query.q.length > 0 &&
                    <NoMatching datasets={this.props.datasets}
                                strategy={this.props.strategy}
                    />
                  }
                  <SearchResults
                      searchResults={this.props.datasets}
                      totalNumberOfResults={this.props.hitCount}
                      onClickTag={this.onClickTag}
                  />
                  {this.props.hitCount > 20 &&
                      <Pagination
                        currentPage={+this.props.location.query.page || 1}
                        maxPage={Math.ceil(this.props.hitCount/config().resultsPerPage)}
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
  dispatch: React.PropTypes.func.isRequired,
  progress: React.PropTypes.number.isRequired,
  hasError: React.PropTypes.bool.isRequired,
  strategy: React.PropTypes.string.isRequired,
  freeText: React.PropTypes.string,
  errorMessage: React.PropTypes.string
}


function mapStateToProps(state) {
  let { results , facetPublisherSearch, facetRegionSearch, facetFormatSearch, regionMapping} = state;
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

export default connect(mapStateToProps)(Search);
