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
  }

  handleChange(){

  }

  toggleFilter(option){
    this.props.toggleFilter(option, this.props.title);
  }

  clearSearch(){

  }

  renderCondition(option){
    if(!option){
      return null;
    }
    return <button type='button' className={`${this.checkActiveOption(option) ? 'btn-primary' : 'btn-default'} btn`} onClick={this.toggleFilter.bind(this, option)}>{option.name} {option.count}</button>;
  }

  checkActiveOption(option){
    let query = this.props.location.query;
    let publisher = query.publisher;
    if(!publisher){
      return false;
    } else if(publisher !== option.id){
      return false;
    }
    return true;
  }

  getActiveOption(){
    let query = this.props.location.query;
    let publisher = find(this.props.options, o=>o.id === query[this.props.title]);
    return this.renderCondition(publisher);
  }

  render() {
    return (
      <div>
        <h4>{this.props.title}</h4>
        {this.getActiveOption()}
        <form className='form-inline'>
          <input className='form-control' type="text" value={this.state.searchText} onChange={this.handleChange}/>
          <button type='button' onClick={this.clearSearch}>clear</button>
        </form>

        {this.props.options.map((option, i)=>
            !this.checkActiveOption(option) && <div key={i}>{this.renderCondition(option)}</div>
        )}
      </div>
    );
  }
}
Filter.propTypes = {options: React.PropTypes.array, title: React.PropTypes.string, toggleFilter: React.PropTypes.func};
Filter.defaultProps = {options: []};

export default Filter;
