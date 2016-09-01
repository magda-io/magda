import React, { Component } from 'react';
import SearchBox from './SearchBox';
import { browserHistory } from 'react-router';
import './Search.css';


class Search extends Component {
  constructor(props) {
    super(props);
    this.updateSearchText=this.updateSearchText.bind(this);
  }

  updateSearchText(newText) {

  }

  render() {
    return (
      <div className='search'>
        <div className='search-header jumbotron'>
          <SearchBox searchValue={this.props.location.query.q}
                     search={this.updateSearchText}
                     updateSearchText={this.updateSearchText}
                     />
        </div>
        {this.props.children}
      </div>
    );
  }
}
export default Search;
