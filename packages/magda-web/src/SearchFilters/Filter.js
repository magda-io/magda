import React, { Component } from 'react';
import FilterCondition from './FilterCondition';

class Filter extends Component {
  constructor(props) {
    super(props);
    this.toggleFilter = this.toggleFilter.bind(this);
    this.handleChange = this.handleChange.bind(this);

    this.state = {
      searchText: ''
    }
  }

  toggleFilter(condition, i){
    this.props.toggleFilter(condition, i, this.props.title);
  }

  handleChange(e){
    this.setState({
      searchText: e.target.value
    })
  }

  renderCondition(condition, i){
    return <button type='button' className={`${condition.isActive ? 'btn-primary' : 'btn-default'} btn`} onClick={this.toggleFilter.bind(this, condition, i)}>{condition.name} {condition.count}</button>;
  }

  render() {
    return (
      <div>
        <h4>{this.props.title}</h4>

        <div className='filter-selected'>
          {this.props.conditions.map((condition, i)=>
              condition.isActive && <div key={i}>{this.renderCondition(condition, i)}</div>
          )}
        </div>
        <input className='form-control' type="text" value={this.state.searchText} onChange={this.handleChange}/>
        <div>
          {this.props.conditions.map((condition, i)=>
            !condition.isActive && <div key={i}>{this.renderCondition(condition, i)}</div>
          )}
        </div>
      </div>
    );
  }
}
Filter.propTypes = {conditions: React.PropTypes.array, title: React.PropTypes.string};
Filter.defaultProps = {conditions: []};

export default Filter;
