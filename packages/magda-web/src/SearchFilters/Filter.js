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

  handleChange(e){
    this.setState({
      searchText: e.target.value
    });
  }

  toggleFilter(option){
    this.props.toggleFilter(option, this.props.title);
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
    return <button type='button' className={`${this.checkActiveOption(option) ? 'btn-primary' : 'btn-default'} btn`} onClick={this.toggleFilter.bind(this, option)}>{option.name} {option.hitCount}</button>;
  }

  checkActiveOption(option){
    let query = this.props.location.query;
    let publisher = query.publisher;

    if(!publisher){
      return false;
    }
    if(Array.isArray(this.props.location.query[this.props.title])){
      if(publisher.indexOf(option.id) < 0){
        return false;
      }
      return true;
    }
    if(publisher === option.id){
      return true;
    }
    return false;
  }

  getActiveOption(){
    let query = this.props.location.query;
    let publisher = query.publisher;
    if(!publisher){
      return null;
    }
    if(Array.isArray(this.props.location.query[this.props.title])){
      return publisher.map(p=>{
        return <div key={p}>{this.renderCondition(find(this.props.options, o=>o.id === p))}</div>;
      });
    }else{
      return this.renderCondition(find(this.props.options, o=>o.id === publisher))
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
Filter.propTypes = {options: React.PropTypes.array, title: React.PropTypes.string, toggleFilter: React.PropTypes.func};
Filter.defaultProps = {options: []};

export default Filter;
