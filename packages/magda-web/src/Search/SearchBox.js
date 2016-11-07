import React, { Component } from 'react';

import './SearchBox.css';

class SearchBox extends Component {
  constructor(props) {
    super(props);
    this.handleKeyPress = this.handleKeyPress.bind(this);
  }


  handleKeyPress(event) {
    // when user hit enter, no need to submit the form
    if(event.charCode===13){
        event.preventDefault();
        this.props.onSearchTextChange(this.props.value)
    }
  }


  render() {
    return (
      <form className="search-box col-sm-8 col-sm-offset-4">
        <div className='input-group'>
        <input
          type="text"
          name="search"
          className='form-control'
          value={this.props.value}
          onChange={(e)=>this.props.onSearchTextChange(e.target.value)}
          onKeyPress={this.handleKeyPress}
        />
        <span className="input-group-addon"><i className="fa fa-search" aria-hidden="true"></i> </span>
        </div>
      </form>
    );
  }
}
SearchBox.propTypes = {updateQuery: React.PropTypes.func};

SearchBox.defaultProps = { searchValue: '' };

SearchBox.contextTypes ={
  store: React.PropTypes.object
}


export default SearchBox;
