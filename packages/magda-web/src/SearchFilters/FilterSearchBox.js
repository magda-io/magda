import React, { Component } from 'react';

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
      if(c.name.toLowerCase().indexOf(this.props.searchText.toLowerCase())!==-1){
        filteredOptions.push(c);
      }
    });

    return (
      <div>
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
          <div className='filtered-options'>
            {this.props.searchText.length > 0 && filteredOptions.map((option, i)=>
                <div key={i}>{this.props.renderCondition(option, true)}</div>
            )}
        </div>
        </div>);
  }
}

FilterSearchBox.propTypes = {options: React.PropTypes.array,
                             toggleFilter: React.PropTypes.func,
                             searchText:React.PropTypes.string,
                             clearSearch: React.PropTypes.func,
                             handleChange: React.PropTypes.func,
                             allowMultiple: React.PropTypes.bool};
FilterSearchBox.defaultProps = {options: [], allowMultiple: false};

export default FilterSearchBox;
