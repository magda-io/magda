import React, { Component } from 'react';
import './FilterSearchBox.css';
import ProgressBar from '../ProgressBar';
import defined from '../defined';

class FilterSearchBox extends Component {
  constructor(props) {
    super(props);
    this.handleChange = this.handleChange.bind(this);
    this.clearSearch = this.clearSearch.bind(this);
    this.callback = this.callback.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);

    this.state ={
      searchText: '',
      indexOfOptionOnFocus: -1
    }
  }

  handleKeyDown(e){
    if(e.keyCode === 38){
      e.preventDefault;
      this.move('up')
    }

    if(e.keyCode === 40){
      e.preventDefault;
      this.move('down')
    }
  }

  move(direction){
    let totalNumberOfItemsToNavigate = this.props.options.length;
    let current = this.state.indexOfOptionOnFocus;
    let next;
    let previous;

    if(direction === 'up'){
      if(0 < current){
        previous = current - 1;
      } else{
        previous = totalNumberOfItemsToNavigate - 1;
      }
      this.setState({
        indexOfOptionOnFocus : previous
      })
    }

    if(direction === 'down'){
      if(current < totalNumberOfItemsToNavigate -1){
        next = current + 1;
      } else{
        next = 0;
      }
      this.setState({
        indexOfOptionOnFocus : next
      })
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
        <form onKeyDown={this.handleKeyDown}>
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
            {this.state.searchText.length > 0 &&
              <ProgressBar progress={this.props.loadingProgress}/>
            }
          </form>

          {this.state.searchText.length > 0 &&
            <ul className='filtered-options list-unstyled' onKeyDown={this.handleKeyDown}>
              {this.props.options.map((option, i)=>
                  <li key={i}>
                      {this.props.renderCondition(option, null, this.callback, (this.state.indexOfOptionOnFocus === i))}
                  </li>
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
