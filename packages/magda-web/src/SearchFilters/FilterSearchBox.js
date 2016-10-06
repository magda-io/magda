import React, { Component } from 'react';
import './FilterSearchBox.css';
import ProgressBar from '../ProgressBar';

class FilterSearchBox extends Component {
  constructor(props) {
    super(props);
    this.handleChange = this.handleChange.bind(this);
    this.clearSearch = this.clearSearch.bind(this);
    this.renderCondition = this.renderCondition.bind(this);
    this.toggleFilter= this.toggleFilter.bind(this);
  }

  handleChange(e){
    this.props.handleChange(e);
  }

  clearSearch(){
    this.props.clearSearch();
  }

  renderCondition(){
    this.props.renderCondition();
  }

  toggleFilter(option){
    this.props.toggleFilter(option, this.props.allowMultiple);
  }

  render(){
    let filteredOptions = [];
    this.props.options.forEach((c)=>{
      if(c.value.toLowerCase().indexOf(this.props.searchText.toLowerCase())!==-1){
        filteredOptions.push(c);
      }
    });
    return (
      <div className='filter-search-box'>
        <form>
            <i className="fa fa-search search-icon" aria-hidden="true"></i>
            <input className='form-control'
                   type="text"
                   value={this.props.searchText}
                   onChange={this.handleChange}
                   />
            {this.props.searchText.length > 0 &&
              <button type='button' className='btn btn-clear-search' onClick={this.clearSearch}>
                <i className="fa fa-times" aria-hidden="true"></i>
              </button>}
          </form>
          {this.props.searchText.length > 0 &&
            <ProgressBar progress={this.props.loadingProgress}/>
          }
          {this.props.searchText.length > 0 &&
            <ul className='filtered-options list-unstyled'>

              {filteredOptions.map((option, i)=>
                  <li key={i}>{this.props.renderCondition(option, true)}</li>
              )}
            </ul>
          }
        </div>);
  }
}

FilterSearchBox.propTypes = {options: React.PropTypes.array,
                             toggleFilter: React.PropTypes.func,
                             searchText:React.PropTypes.string,
                             clearSearch: React.PropTypes.func,
                             handleChange: React.PropTypes.func,
                             allowMultiple: React.PropTypes.bool,
                             loadingProgress: React.PropTypes.number};
FilterSearchBox.defaultProps = {options: [], allowMultiple: false};

export default FilterSearchBox;
