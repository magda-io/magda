import React, { Component } from 'react';

class Filter extends Component {
  constructor(props) {
    super(props);
    this.state={
      searchText: ''
    }
    this.handleChange = this.handleChange.bind(this);
    this.clearSearch = this.clearSearch.bind(this);
  }

  handleChange(){

  }

  toggleFilter(option){
    this.props.toggleFilter(option, this.props.title);
  }

  clearSearch(){

  }

  renderCondition(option){
    return <button type='button' onClick={this.toggleFilter.bind(this, option)}>{option.name} {option.count}</button>;
  }

  checkActiveOption(option){
    let query = this.props.location.query;
    let publishers = query.publisher;
    if(!publishers){
      return false;
    }
  }

  render() {
    return (
      <div>
        <h4>{this.props.title}</h4>
        <form className='form-inline'>
          <input className='form-control' type="text" value={this.state.searchText} onChange={this.handleChange}/>
          <button type='button' onClick={this.clearSearch}>clear</button>
        </form>

        {this.props.options.map((option, i)=>
            <div key={i}>{this.renderCondition(option)}</div>
        )}
      </div>
    );
  }
}
Filter.propTypes = {options: React.PropTypes.array, title: React.PropTypes.string, toggleFilter: React.PropTypes.func};
Filter.defaultProps = {options: []};

export default Filter;
