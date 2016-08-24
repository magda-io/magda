import React, { Component } from 'react';
import './SearchBox.css';

class SearchBox extends Component {
  constructor(props) {
    super(props);
    this.state = {value: ''};
  }

  handleChange(){

  }

  render() {
    return (
      <form className="SearchBox">
        <h2 className="SearchBox-header">
          <label>Find data</label>
        </h2>
        <input
          type="text"
          name="search"
          value={this.state.value}
          onChange={this.handleChange}
        />
        <div className='searcbox-suggestions'>Try environment or water in Victoria</div>
      </form>
    );
  }
}

export default SearchBox;
