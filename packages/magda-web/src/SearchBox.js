import React, { Component } from 'react';
import './SearchBox.css';

class SearchBox extends Component {
  constructor(props) {
    super(props);
    this.handleChange = this.handleChange.bind(this);
  }

  handleChange(event){
    this.props.updateSearchText(event.target.value);
  }

  render() {
    return (
      <form className="SearchBox">
        <h2 className="SearchBox-header">
          <label>Find data</label>
        </h2>
        <div className='input-group'>
        <input
          type="text"
          name="search"
          className='form-control'
          value={this.props.searchValue}
          onChange={this.handleChange}
        />
        <span className="input-group-addon"><i className="fa fa-search" aria-hidden="true"></i> </span>
        </div>
        {!this.props.searchValue && <div className='searcbox-suggestions'>Try environment or water in Victoria</div>}
      </form>
    );
  }
}
SearchBox.propTypes =
  {searchValue: React.PropTypes.string,
   updateSearchText: React.PropTypes.func
  };
SearchBox.defaultProps = { searchValue: '' };

export default SearchBox;
