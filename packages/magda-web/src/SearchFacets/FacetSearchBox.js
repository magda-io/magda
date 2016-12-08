import React, { Component } from 'react';
import './FacetSearchBox.css';
import debounce from 'lodash.debounce';

/**
  * Searchbox for facet facet
  */
class FacetSearchBox extends Component {
  constructor(props) {
    super(props);
    this.onSearchTextChange = this.onSearchTextChange.bind(this);
    this.clearSearch = this.clearSearch.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.onExcKeyDown = this.onExcKeyDown.bind(this);
    this.onClick = this.onClick.bind(this);
    this.debounceSearchFacet = debounce(this.searchFacet, 200);

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
    window.addEventListener('keydown', this.onExcKeyDown);
  }

  componentWillUnmount(){
    window.removeEventListener('keydown', this.onExcKeyDown);
  }

  onClick(option, event){
    this.props.onToggleOption(option);
    this.clearSearch();
  }

  onExcKeyDown(event){
    if(event.which === 27){
      this.clearSearch();
    }
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

    if(e.keyCode === 13){
      if(e.target.tagName === 'INPUT')
      e.preventDefault();
      return false;
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
    // when the search text is updated, we need to reset the index
    this.setState({
      searchText: e.target.value,
      indexOfOptionOnFocus: -1
    });
    this.debounceSearchFacet(e.target.value);
  }

  searchFacet(text) {
    this.props.searchFacet(text);
  }

  clearSearch(){
    this.setState({
      searchText: ''
    })
  }


  render(){
    return (
      <div className='facet-search-box'>
        <form onKeyDown={this.handleKeyDown}>
            <i className="fa fa-search search-icon" aria-hidden="true"></i>
            <input className='form-control'
                   type="text"
                   value={this.state.searchText}
                   onInput={this.onSearchTextChange}
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
                      {this.props.renderOption(option, this.onClick,  null, (this.state.indexOfOptionOnFocus === i))}
                  </li>
              )}
            </ul>
          }
        </div>);
  }
}

FacetSearchBox.propTypes = {options: React.PropTypes.array,
                            searchFacet: React.PropTypes.func,
                            renderOption: React.PropTypes.func,
                            onToggleOption: React.PropTypes.func};
FacetSearchBox.defaultProps = {options: []};

export default FacetSearchBox;
