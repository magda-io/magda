import React, { Component } from 'react';

class FilterCondition extends Component {
  constructor(props) {
    super(props);
    this.state ={
      isActive: true
    }
    this.toggleFilter = this.toggleFilter.bind(this);
  }

  toggleFilter(){
    this.setState({
      isActive: !this.state.isActive
    });
  }

  render() {
    return (
      <button type='button' className={`${this.state.isActive ? 'btn-primary' : 'btn-default'} btn`} onClick={this.toggleFilter}>{this.props.condition.name} {this.props.condition.count}</button>
    );
  }
}
FilterCondition.propTypes = {condition: React.PropTypes.object};
FilterCondition.defaultProps = {condition: {}};

export default FilterCondition;
