import React, { Component } from 'react';

class FilterHeader extends Component {
  render(){
    return (
      <div className='clearfix filter-header'>
        <h4 className='filter-title'>{this.props.title}</h4>
        <button
        type='button'
        disabled={!this.props.searchText.length}
        className='btn btn-reset'
        onClick={()=>{this.props.resetFilter}}>Reset</button>
      </div>
      );
  }
}

FilterHeader.propTypes = {title: React.PropTypes.string,
                             resetFilter: React.PropTypes.func,
                             searchText: React.PropTypes.string};
FilterHeader.defaultProps = {searchText: ''};

export default FilterHeader;
