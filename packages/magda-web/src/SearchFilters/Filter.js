import React, { Component } from 'react';
import find from 'lodash.find';

class Filter extends Component {
  constructor(props) {
    super(props);
    this.state={
      searchText: ''
    }
    this.handleChange = this.handleChange.bind(this);
    this.clearSearch = this.clearSearch.bind(this);
    this.renderCondition = this.renderCondition.bind(this);
    this.resetFilter = this.resetFilter.bind(this);
    this.toggleFilter= this.toggleFilter.bind(this);
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

  renderCondition(option){
    if(!option){
      return null;
    }
    return <button type='button' className={`${this.checkActiveOption(option) ? 'is-active' : ''} btn-option`} onClick={this.toggleFilter.bind(this, option)}>{option.name} {option.hitCount}{this.checkActiveOption(option) ? <i className="fa fa-times" aria-hidden="true"></i> : ''}</button>;
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
    let inactiveOptions = this.props.options.filter(o=>!this.checkActiveOption(o));
    let filteredInactiveOptions = [];
    inactiveOptions.forEach((c)=>{
      if(c.name.toLowerCase().indexOf(this.state.searchText)!==-1){
        filteredInactiveOptions.push(c);
      }
    });

    return (
      <div>
        <h4>{this.props.title}</h4>
        <button className='btn' onClick={this.resetFilter} >reset</button>
        {this.getActiveOption()}
        <form className='form-inline'>
          <input className='form-control' type="text" value={this.state.searchText} onChange={this.handleChange}/>
          <button type='button' onClick={this.clearSearch}>clear</button>
        </form>

        <div className='filtered-options'>
          {this.state.searchText.length !== 0 && filteredInactiveOptions.map((option, i)=>
              <div key={i}>{this.renderCondition(option)}</div>
          )}
        </div>
        <div className='other-options'>
        {this.state.searchText.length === 0 && inactiveOptions.map((option, i)=>
              <div key={i}>{this.renderCondition(option)}</div>
        )}
        </div>
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
