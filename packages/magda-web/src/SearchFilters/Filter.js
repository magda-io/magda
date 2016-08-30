import React, { Component } from 'react';
import FilterCondition from './FilterCondition';

class Filter extends Component {
  constructor(props) {
    super(props);
    this.toggleFilter = this.toggleFilter.bind(this);
    this.handleChange = this.handleChange.bind(this);

    this.state = {
      searchText: '',
      resultConditions: []
    }
  }

  toggleFilter(condition, i){
    this.props.toggleFilter(condition, i, this.props.title);
  }

  handleChange(e){
    this.setState({
      searchText: e.target.value
    })

    //  filter inactive conditions
    let conditionsToSearch = this.props.conditions.filter(c=>!c.isActive);
    let resultConditions = [];

    if(conditionsToSearch.forEach((c)=>{
      if(c.name.toLowerCase().indexOf(e.target.value) !== -1){
        resultConditions.push(c);
        this.setState({
          resultConditions: resultConditions
        })
      }
    }));
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
        <div className='filtered-conditions'>
          {this.state.searchText.length !== 0 && this.state.resultConditions.map((condition, i)=>
              <div key={i}>{this.renderCondition(condition, i)}</div>
          )}
        </div>
        <div>
          {this.state.searchText.length === 0 &&  this.props.conditions.map((condition, i)=>
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
