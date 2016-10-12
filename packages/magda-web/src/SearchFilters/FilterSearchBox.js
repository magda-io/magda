import React, { Component } from 'react';
import './FilterSearchBox.css';
import ProgressBar from '../ProgressBar';

class FilterSearchBox extends Component {
  constructor(props) {
    super(props);
    this.handleChange = this.handleChange.bind(this);
    this.clearSearch = this.clearSearch.bind(this);
    this.callback = this.callback.bind(this);
    this.state ={
      searchText: ''
    }
  }

  handleChange(e){
    this.setState({
      searchText: e.target.value
    });
    this.props.searchFilter(e.target.value);
  }

  clearSearch(){
    this.setState({
      searchText: ''
    })
  }

  callback(){
    this.clearSearch();
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
            <ProgressBar progress={this.props.loadingProgress}/>
          }
          {this.state.searchText.length > 0 &&
            <ul className='filtered-options list-unstyled'>
              {this.props.options.map((option, i)=>
                  <li key={i}>{this.props.renderCondition(option, null, this.callback)}</li>
              )}
            </ul>
          }
        </div>);
  }
}

FilterSearchBox.propTypes = {options: React.PropTypes.array,
                             searchFilter: React.PropTypes.func,
                             allowMultiple: React.PropTypes.bool,
                             loadingProgress: React.PropTypes.number};
FilterSearchBox.defaultProps = {options: [], allowMultiple: false};

export default FilterSearchBox;
