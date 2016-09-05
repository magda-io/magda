import React, { Component } from 'react';
import find from 'lodash.find';
import './Filter.css';

const DEFAULTSIZE = 5;


class Filter extends Component {
  constructor(props) {
    super(props);
    this.state={
      searchText: '',
      isOpen: false
    }
    this.handleChange = this.handleChange.bind(this);
    this.clearSearch = this.clearSearch.bind(this);
    this.renderCondition = this.renderCondition.bind(this);
    this.resetFilter = this.resetFilter.bind(this);
    this.toggleFilter= this.toggleFilter.bind(this);
    this.toggleOpen = this.toggleOpen.bind(this);
  }

  handleChange(e){
    this.setState({
      searchText: e.target.value
    });
  }

  toggleFilter(option){
    let currrentFilters;
    // force filters into array
    if (!this.props.location.query[this.props.id]){
      currrentFilters = [];
    }
    // if already array
    else if(Array.isArray(this.props.location.query[this.props.id])){
      currrentFilters = this.props.location.query[this.props.id];
    }
    // if only one item, create array
    else{
      currrentFilters = [this.props.location.query[this.props.id]];
    }
    // add or remove from array
    if(currrentFilters.indexOf(option.id) > -1){
      currrentFilters.splice(currrentFilters.indexOf(option.id), 1);
    } else{
      currrentFilters.push(option.id)
    }

    this.props.updateQuery({
      [this.props.id]: currrentFilters
    });

  }

  resetFilter(){
    this.props.updateQuery({[this.props.id]: []});
  }

  clearSearch(){
    this.setState({
      searchText: ''
    })
  }

  toggleOpen(){
    this.setState({
      isOpen: !this.state.isOpen
    })
  }

  renderCondition(option){
    if(!option){
      return null;
    }
    return <button type='button' className={`${this.checkActiveOption(option) ? 'is-active' : ''} btn-option btn`} onClick={this.toggleFilter.bind(this, option)}>
      <span className='option-name'>{option.name}</span>
      <span className='option-count'>{option.hitCount}</span>
      {this.checkActiveOption(option) ? <i className="fa fa-times" aria-hidden="true"></i> : ''}</button>;
  }

  checkActiveOption(option){
    let query = this.props.location.query;
    let filter = query[this.props.id];

    if(!filter){
      return false;
    }
    /// if query is already array, check if item exist in array already
    if(Array.isArray(this.props.location.query[this.props.id])){
      if(filter.indexOf(option.id) < 0){
        return false;
      }
      return true;
    }
    // if query is string, check directly
    if(filter === option.id){
      return true;
    }
    return false;
  }

  getActiveOption(){
    let query = this.props.location.query;
    let filter = query[this.props.id];
    if(!filter){
      return null;
    }
    if(Array.isArray(this.props.location.query[this.props.id])){
      return filter.map(p=>{
        return <div key={p}>{this.renderCondition(find(this.props.options, o=>o.id === p))}</div>;
      });
    }else{
      return this.renderCondition(find(this.props.options, o=>o.id === filter))
    }
  }

  render() {
    let inactiveOptions = this.props.options.filter(o=>!this.checkActiveOption(o)).sort((o1, o2)=>o1.hitCount < o2.hitCount);
    let filteredInactiveOptions = [];
    let size = this.state.isOpen ? inactiveOptions.length : (DEFAULTSIZE > inactiveOptions.length ? inactiveOptions.length : DEFAULTSIZE);

    inactiveOptions.forEach((c)=>{
      if(c.name.toLowerCase().indexOf(this.state.searchText)!==-1){
        filteredInactiveOptions.push(c);
      }
    });

    return (
      <div className='filter'>
      <div className='clearfix filter-header'>
        <h4 className='filter-title'>{this.props.title}</h4>
        <button type='button' className='btn btn-reset' onClick={this.resetFilter} >Reset</button>
      </div>
        {this.getActiveOption()}
        <form>
          <i className="fa fa-search search-icon" aria-hidden="true"></i>
          <input className='form-control' type="text" value={this.state.searchText} onChange={this.handleChange}/>
          {this.state.searchText.length > 0 &&
            <button type='button' className='btn btn-clear-search' onClick={this.clearSearch}>
              <i className="fa fa-times" aria-hidden="true"></i>
            </button>}
        </form>

        <div className='filtered-options'>
          {this.state.searchText.length !== 0 && filteredInactiveOptions.map((option, i)=>
              <div key={i}>{this.renderCondition(option)}</div>
          )}
        </div>
        <div className='other-options'>
        {this.state.searchText.length === 0 && inactiveOptions.slice(0, size+1).map((option, i)=>
              <div key={i}>{this.renderCondition(option)}</div>
        )}
        </div>
        <button onClick={this.toggleOpen} className='btn btn-reset'>{this.state.isOpen ? `Show less...` : `Show ${inactiveOptions.length - size} more...`}</button>
      </div>
    );
  }
}
Filter.propTypes = {options: React.PropTypes.array,
                    title: React.PropTypes.string,
                    toggleFilter: React.PropTypes.func,
                    id: React.PropTypes.string,
                    updateQuery: React.PropTypes.func};
Filter.defaultProps = {options: []};

export default Filter;
