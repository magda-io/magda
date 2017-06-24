// @flow
// eslint-disable-next-line
import {RouterContext } from 'react-router';

import './SearchBox.css';
import {connect} from 'react-redux';
import { bindActionCreators } from 'redux';
// import {config} from '../config.js';
import debounce from 'lodash.debounce';
import defined from '../helpers/defined';
import React, { Component } from 'react';
import {fetchRegionMapping} from '../actions/regionMappingActions';
import queryString from 'query-string';


class SearchBox extends Component {
  state : {
    searchText: ?string
  }

  constructor(props) {
    super(props);
    const self: any = this;
    self.handleSearchFieldEnterKeyPress = this.handleSearchFieldEnterKeyPress.bind(this);
    self.updateQuery = this.updateQuery.bind(this);
    self.updateSearchText = this.updateSearchText.bind(this);
    self.onClickSearch = this.onClickSearch.bind(this);
    self.onSearchTextChange = this.onSearchTextChange.bind(this);
    self.getSearchBoxValue = this.getSearchBoxValue.bind(this);

    // it needs to be undefined here, so the default value should be from the url
    // once this value is set, the value should always be from the user input
    this.state={
      searchText: undefined
    }
  }

  debounceUpdateSearchQuery = debounce(this.updateSearchText, 3000);

  componentWillMount(){
    this.props.fetchRegionMapping();
  }

  componentWillReceiveProps(nextProps){
    this.setState({
      searchText: nextProps.location.query.q
    })
  }


  onSearchTextChange(event){
    const text = event.target.value;
    this.setState({
      searchText: text
    });
    this.debounceUpdateSearchQuery(text);
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
   * query in this case, is one or more of the params
   * eg: {'q': 'water'}
   */
  updateQuery(query){
    let {router} = this.context;
    router.push({
      pathname: '/search',
      query: Object.assign(queryString.parse(this.props.location.search), query)
    });
  }

  /**
   * This calculate the value to show in the search box
   */
  getSearchBoxValue(){
    if(defined(this.state.searchText)){
      return this.state.searchText;
    } else if(defined(queryString.parse(this.props.location.search).q)){
      return queryString.parse(this.props.location.search).q
    }
    return '';
  }

  onDismissError(){
    // remove all current configurations
    this.updateSearchText('');
  }


  render() {
    return (
        <form className='search-box'>
          <div className='search-box__input'>
          <input
            type='text'
            name='search'
            className='form-control search-box__form-control'
            placeholder='Search'
            value={this.getSearchBoxValue()}
            onChange={this.onSearchTextChange}
            onKeyPress={this.handleSearchFieldEnterKeyPress}
          />
          </div>
          <button onClick={this.onClickSearch} type='button' className='btn search-box__icon'><i className='fa fa-search' aria-hidden='true'></i> </button>
        </form>
    );
  }
}

SearchBox.contextTypes ={
  router: React.PropTypes.object.isRequired,
}



const mapStateToProps = (state, ownProps)=> {
  let { datasetSearch } = state;
  return {
    freeText: datasetSearch.freeText,
  }
}

const mapDispatchToProps = (dispatch: Dispatch<*>) =>
   bindActionCreators({
    fetchRegionMapping: fetchRegionMapping,
  }, dispatch);


export default connect(mapStateToProps, mapDispatchToProps)(SearchBox);
