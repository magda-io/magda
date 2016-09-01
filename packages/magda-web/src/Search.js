import React, { Component } from 'react';
import SearchBox from './SearchBox';
import { browserHistory, RouterContext } from 'react-router';
import './Search.css';


class Search extends Component {
  constructor(props) {
    super(props);
    this.updateSearchText=this.updateSearchText.bind(this);
  }

  updateSearchText(newText) {
    this.context.router.push({
      pathname: this.props.location.pathname,
      query: { q: newText },
    });
    console.log(newText);
    console.log(this.props.location.query);
  }

  render() {
    return (
      <div className='search'>
        <div className='search-header jumbotron'>
          <SearchBox searchValue={this.props.location.query.q}
                     updateSearchText={this.updateSearchText}
                     />
        </div>
        {this.props.children}
      </div>
    );
  }
}

Search.contextTypes ={
  router: React.PropTypes.object.isRequired
}
export default Search;
