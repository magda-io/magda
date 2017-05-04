// eslint-disable-next-line
import {RouterContext } from 'react-router';

import './SearchBox.css';
import {connect} from 'react-redux';
import { bindActionCreators } from "redux";
import {config} from '../config.js';
import debounce from 'lodash.debounce';
import defined from '../helpers/defined';
import React, { Component } from 'react';
import {fetchRegionMapping} from '../actions/regionMapping';

class SearchBox extends Component {
  constructor(props) {
    super(props);
    this.debounceUpdateSearchQuery = debounce(this.updateSearchText, 3000);
    this.handleSearchFieldEnterKeyPress = this.handleSearchFieldEnterKeyPress.bind(this);
    this.updateQuery = this.updateQuery.bind(this);
    this.updateSearchText = this.updateSearchText.bind(this);
    this.onClickSearch = this.onClickSearch.bind(this);
    this.onSearchTextChange = this.onSearchTextChange.bind(this);
    this.getSearchBoxValue = this.getSearchBoxValue.bind(this);

    // it needs to be undefined here, so the default value should be from the url
    // once this value is set, the value should always be from the user input
    this.state={
      searchText: undefined
    }
  }

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
      query: Object.assign(this.props.location.query, query)
    });
  }

  /**
   * This calculate the value to show in the search box
   */
  getSearchBoxValue(){
    if(defined(this.state.searchText)){
      return this.state.searchText;
    } else if(defined(this.props.location.query.q)){
      return this.props.location.query.q
    }
    return '';
  }

  onDismissError(){
    // remove all current configurations
    this.updateSearchText('');
  }


  render() {
    return (
        <form className="search-box">
          <div className='search-box__input'>
          <input
            type="text"
            name="search"
            className='form-control search-box__form-control'
            placeholder="Search"
            value={this.getSearchBoxValue()}
            onChange={this.onSearchTextChange}
            onKeyPress={this.handleSearchFieldEnterKeyPress}
            ref={(searchBox)=>{searchBox && searchBox.focus()}}
          />
          </div>
          <button onClick={this.onClickSearch} type='button' className="btn search-box__icon"><i className="fa fa-search" aria-hidden="true"></i> </button>
        </form>
    );
  }
}

SearchBox.contextTypes ={
  router: React.PropTypes.object.isRequired,
}

SearchBox.propTypes = {
  freeText: React.PropTypes.string,
  errorMessage: React.PropTypes.string
}


function mapStateToProps(state, ownProps) {
  let { results } = state;
  return {
    freeText: results.freeText,
  }
}

function mapDispatchToProps(dispatch) {
  return bindActionCreators({
    fetchRegionMapping: fetchRegionMapping,
  }, dispatch);
}

export default connect(mapStateToProps, mapDispatchToProps)(SearchBox);
