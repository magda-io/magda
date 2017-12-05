// @flow

import {Link } from 'react-router-dom';
import './Search.css';
import {connect} from 'react-redux';
import {config} from '../../config' ;
import defined from '../../helpers/defined';
import Pagination from '../../UI/Pagination';
import Notification from '../../UI/Notification';
import PublisherBox from '../../Components/PublisherBox';
import ReactDocumentTitle from 'react-document-title';
import React, { Component } from 'react';
import SearchFacets from '../../Components/SearchFacets/SearchFacets';
import Publisher from '../../Components/SearchFacets/Publisher';
import SearchResults from '../SearchResults/SearchResults';
import MatchingStatus from './MatchingStatus';
import { bindActionCreators } from 'redux';
import { fetchSearchResultsIfNeeded, resetDatasetSearch } from '../../actions/datasetSearchActions';
import {fetchFeaturedPublishersFromRegistry} from '../../actions/featuredPublishersActions';

// eslint-disable-next-line
import PropTypes from 'prop-types';

import queryString from 'query-string';
import ProgressBar from '../../UI/ProgressBar';


class Search extends Component {
  state: {
    searchText: ?string
  }

  constructor(props) {
    super(props);
    const self: any = this;

    self.onClickTag = this.onClickTag.bind(this);
    self.updateQuery = this.updateQuery.bind(this);
    self.onDismissError = this.onDismissError.bind(this);
    self.updateSearchText = this.updateSearchText.bind(this);
    self.onToggleDataset = this.onToggleDataset.bind(this);

    // it needs to be undefined here, so the default value should be from the url
    // once this value is set, the value should always be from the user input
    this.state={
      searchText: undefined
    }
  }


  componentWillMount(){
    this.props.resetDatasetSearch();
    this.props.fetchSearchResultsIfNeeded(queryString.parse(this.props.location.search));
  }


  componentWillReceiveProps(nextProps){
    nextProps.fetchSearchResultsIfNeeded(queryString.parse(nextProps.location.search));
    if(nextProps.datasets.length > 0 &&
       nextProps.publisherOptions.length > 0 &&
       nextProps.publisherOptions.filter(o=>o.identifier).map(o=>o.identifier).toString() !== this.props.publisherOptions.filter(o=>o.identifier).map(o=>o.identifier).toString()){
      const featuredPublishersById = nextProps.publisherOptions.filter(o=>o.identifier).map(o=> o.identifier);
      this.props.fetchFeaturedPublishersFromRegistry(featuredPublishersById);
    }
  }

  componentWillUnmount(){
    this.props.resetDatasetSearch()
  }

  onClickTag(tag: string){
    this.setState({
      searchText: tag
    });
    this.updateSearchText(tag);
  }

  /**
   * update only the search text, remove all facets
   */
  updateSearchText(text: string){
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

  /**
   * query in this case, is one or more of the params
   * eg: {'q': 'water'}
   */
  updateQuery(query){
    this.context.router.history.push({
      pathname: this.props.location.pathname,
      search: queryString.stringify(Object.assign(queryString.parse(this.props.location.search), query))
    });
  }

  onDismissError(){
    // remove all current configurations
    this.updateSearchText('');
    this.props.resetDatasetSearch();
  }

  onToggleDataset(datasetIdentifier){
    this.updateQuery({
      open: datasetIdentifier === queryString.parse(this.props.location.search).open ? '' : datasetIdentifier
    })
  }

  searchBoxEmpty(){
    return !defined(queryString.parse(this.props.location.search).q) || queryString.parse(this.props.location.search).q.length === 0
  }

  renderSuggestions(){
    return <div><h3> Try search for </h3><ul>{config.exampleSearch.map(item=><li key={item}><Link to={`search?q=${item}`} key={item}> {item}</Link></li>)}</ul></div>
  }

  render() {
    const searchText = queryString.parse(this.props.location.search).q || '';
    return (
      <ReactDocumentTitle title={`Searching for ${searchText} | ${config.appName}` }>
      <div>
      {this.props.isFetching && <ProgressBar/>}
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
                {searchText.length > 0 && !this.props.isFetching &&
                 !this.props.error && <div className='results-count'>{this.props.hitCount} results found</div>}
                {searchText.length === 0 && <div>{this.renderSuggestions()}</div>}
                {searchText.length > 0 &&
                 !this.props.isFetching &&
                 !this.props.error &&
                 <div>
                 <Publisher updateQuery={this.updateQuery}
                            component={'recommendations'}
                 />

                 {!this.searchBoxEmpty() &&
                    <MatchingStatus datasets={this.props.datasets}
                                    strategy={this.props.strategy}
                    />
                  }

                  <SearchResults
                      strategy={this.props.strategy}
                      searchResults={this.props.datasets}
                      onClickTag={this.onClickTag}
                      onToggleDataset={this.onToggleDataset}
                      openDataset={queryString.parse(this.props.location.search).open}
                  />
                  {this.props.hitCount > config.resultsPerPage &&
                      <Pagination
                        currentPage={+queryString.parse(this.props.location.search).page || 1}
                        maxPage={Math.ceil(this.props.hitCount/config.resultsPerPage)}
                        location={this.props.location}
                      />
                   }
                 </div>
               }
               {!this.props.isFetching && this.props.error &&
                  <Notification content={this.props.error}
                                type='error'
                                onDismiss={this.onDismissError}/>
               }
              </div>

            <div className='col-sm-4'>
            {(!this.searchBoxEmpty() && this.props.datasets.length > 0) && this.props.featuredPublishers.map(p=><PublisherBox key={p.id} publisher={p}/>)}
            </div>
            </div>
          </div>
        </div>
      </div>
      </ReactDocumentTitle>
    );
  }
}

Search.contextTypes ={
  router: PropTypes.object.isRequired,
}


const mapDispatchToProps = (dispatch: Dispatch<*>) =>
 bindActionCreators({
    fetchSearchResultsIfNeeded: fetchSearchResultsIfNeeded,
    fetchFeaturedPublishersFromRegistry: fetchFeaturedPublishersFromRegistry,
    resetDatasetSearch: resetDatasetSearch
  }, dispatch);


function mapStateToProps(state, ownProps) {
  let { datasetSearch, featuredPublishers } = state;
  return {
    datasets: datasetSearch.datasets,
    publisherOptions: datasetSearch.publisherOptions.slice(0, 5),
    hitCount: datasetSearch.hitCount,
    isFetching: datasetSearch.isFetching,
    progress: datasetSearch.progress,
    strategy: datasetSearch.strategy,
    error: datasetSearch.error,
    freeText: datasetSearch.freeText,
    featuredPublishers: featuredPublishers.publishers
  }
}

export default connect(mapStateToProps, mapDispatchToProps)(Search);
