import React, { Component } from 'react';


import './SearchBox.css';

class SearchBox extends Component {
  constructor(props) {
    super(props);
    this.state = {
      searchText: ''
    }
  }

  searchBoxMounted(searchBox) {
    searchBox.focus();
  }

  onChange(event){
    this.setState({
      searchText: event.target.value
    });
    this.debounceSearch(event.target.value);
  }

  render() {
    return (
      <form className="search-box">
        <div className='input-group'>
        <input
          type="text"
          name="search"
          className='form-control'
          placeholder="Enter a search term"
          value={this.props.value}
          onChange={(e)=>{this.props.onChange(e.target.value)}}
          onKeyPress={this.props.onKeyPress}
          ref={this.searchBoxMounted}
        />
        <span className="input-group-addon"><i className="fa fa-search" aria-hidden="true"></i> </span>
        </div>
      </form>
    );
  }
}
SearchBox.propTypes = {onChange: React.PropTypes.func, value: React.PropTypes.string, onKeyPress: React.PropTypes.func};



export default SearchBox;
