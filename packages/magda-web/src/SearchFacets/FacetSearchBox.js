import React, { Component } from 'react';
import './FacetSearchBox.css';

/**
  * Searchbox for facet facet
  */
class FacetSearchBox extends Component {
  constructor(props) {
    super(props);
    this.onSearchTextChange = this.onSearchTextChange.bind(this);
    this.clearSearch = this.clearSearch.bind(this);
    this.callback = this.callback.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);

    /**
     * @type {object}
     * @property {string} searchText the user input when doing search
     * @property {number} indexOfOptionOnFocus the index of option on focus when using keyboard up and down keys to navigate
     */
    this.state ={
      searchText: '',
      indexOfOptionOnFocus: -1
    }
  }

  componentDidMount(){
    // when esc key is pressed at anytime, clear search box and close the search result list
    window.addEventListener('keydown', (event)=>{
      if(event.which === 27){
        this.clearSearch();
      }
    });
  }

  handleKeyDown(e){
    if(e.keyCode === 38){
      e.preventDefault();
      this.move('up')
    }

    if(e.keyCode === 40){
      e.preventDefault();
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

  onSearchTextChange(e){
    this.setState({
      searchText: e.target.value
    });
    this.props.searchFacet(e.target.value);
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
      <div className='facet-search-box'>
        <form onKeyDown={this.handleKeyDown}>
            <i className="fa fa-search search-icon" aria-hidden="true"></i>
            <input className='form-control'
                   type="text"
                   value={this.state.searchText}
                   onChange={this.onSearchTextChange}
                   />
            {this.state.searchText.length > 0 &&
              <button type='button' className='btn btn-clear-search' onClick={this.clearSearch}>
                <i className="fa fa-times" aria-hidden="true"></i>
              </button>}
          </form>

          {this.state.searchText.length > 0 &&
            <ul className='faceted-options list-unstyled' onKeyDown={this.handleKeyDown}>
              {this.props.options.map((option, i)=>
                  <li key={`${option.value}-${i}`}>
                      {this.props.renderOption(option, null, this.callback, (this.state.indexOfOptionOnFocus === i))}
                  </li>
              )}
            </ul>
          }
        </div>);
  }
}

FacetSearchBox.propTypes = {options: React.PropTypes.array,
                            searchFacet: React.PropTypes.func,
                            renderOption: React.PropTypes.func};
FacetSearchBox.defaultProps = {options: []};

export default FacetSearchBox;
