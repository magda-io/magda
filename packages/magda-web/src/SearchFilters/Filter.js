import React, { Component } from 'react';
import FilterCondition from './FilterCondition';

class Filter extends Component {
  constructor(props) {
    super(props);
    this.toggleFilter = this.toggleFilter.bind(this);
  }

  toggleFilter(){


  }

  render() {
    return (
      <div>
        <h4>{this.props.title}</h4>
        <div>
          {this.props.conditions.map((condition, i)=>
            <div key={condition}><FilterCondition condition={condition}/></div>
          )}
        </div>
      </div>
    );
  }
}
Filter.propTypes = {conditions: React.PropTypes.array, title: React.PropTypes.string};
Filter.defaultProps = {conditions: []};

export default Filter;
