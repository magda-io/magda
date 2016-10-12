import React, { Component } from 'react';
import './LocationSearchBox.css';

class LocationSearchBox extends Component {
  constructor(props) {
    super(props);
    this.handleChange = this.handleChange.bind(this);
    this.clearSearch = this.clearSearch.bind(this);
    this.renderCondition = this.renderCondition.bind(this);
    this.state ={
      searchText: ''
    }
  }

  handleChange(e){
    this.setState({
      searchText: e.target.value
    })
    this.props.searchLocation(e.target.value);
  }

  clearSearch(){
    this.setState({
      searchText: ''
    })
  }

  renderCondition(option){
    let result = option.suggestion;
    let callback = this.clearSearch;

    if(!result){
      return null;
    }
    return (
          <button type='button'
                  className='btn location-search-btn'
                  onClick={this.props.toggleFilter.bind(this, option, callback)}
                  title={option.name}>
            <span>{result.geographyLabel} , {result.stateLabel}</span>
            <span>{result.typeLabel} {result.type}</span>
          </button>);
  }

  render(){
    return (
      <div className='filter-search-box'>
        <form>
            <i className="fa fa-search search-icon" aria-hidden="true"></i>
            <input className='form-control'
                   type="text"
                   value={this.state.searchText}
                   onChange={this.handleChange}
                   />
            {this.state.searchText.length > 0 &&
              <button type='button' className='btn btn-clear-search' onClick={this.clearSearch}>
                <i className="fa fa-times" aria-hidden="true"></i>
              </button>}
          </form>
          {this.state.searchText.length > 0 &&
            <div className='filtered-options'>
              {this.state.searchText.length > 0 && this.props.options.map((option, i)=>
                  <div key={i}>{this.renderCondition(option)}</div>
              )}
            </div>
          }
        </div>);
  }
}

LocationSearchBox.propTypes = {options: React.PropTypes.array,
                               toggleFilter: React.PropTypes.func,
                               searchText:React.PropTypes.string,
                               clearSearch: React.PropTypes.func,
                               searchLocation: React.PropTypes.func,
                               allowMultiple: React.PropTypes.bool};
LocationSearchBox.defaultProps = {options: [], allowMultiple: false};

export default LocationSearchBox;
