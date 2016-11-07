import React, { Component } from 'react';
import debounce from 'lodash.debounce';

import './SearchBox.css';

class SearchBox extends Component {
  constructor(props) {
    super(props);
    this.handleKeyPress = this.handleKeyPress.bind(this);
    this.onChange = this.onChange.bind(this);
    this.debounceSearch = debounce(this.props.onSearchTextChange, 10000);

    this.state = {
      searchText : this.props.value
    }
  }

  handleKeyPress(event) {
    // when user hit enter, no need to submit the form
    if(event.charCode===13){
        event.preventDefault();
        this.props.onSearchTextChange(this.state.searchText)
    }
  }

  onChange(event){
    this.setState({
      searchText: event.target.value
    })
    this.debounceSearch(event.target.value);
  }


  render() {
    return (
      <form className="search-box col-sm-8 col-sm-offset-4">
        <div className='input-group'>
        <input
          type="text"
          name="search"
          className='form-control'
          value={this.state.searchText}
          onChange={this.onChange}
          onKeyPress={this.handleKeyPress}
        />
        <span className="input-group-addon"><i className="fa fa-search" aria-hidden="true"></i> </span>
        </div>
      </form>
    );
  }
}
SearchBox.propTypes = {updateQuery: React.PropTypes.func};

SearchBox.contextTypes ={
  store: React.PropTypes.object
}


export default SearchBox;
