import React, { Component } from 'react';
import defined from '../defined';
/**
  * Filter header component, contains a title of the filter and a reset button when there is a active filter
  */
class FilterHeader extends Component {
  hasQuery(query){
    // Note: need to be able to handle multiple query
    if (!defined(query)){
      return false;
    }
    else if(query.length === 0){
      return false;
    }
    return true;
  }

  render(){
    return (
      <div className='clearfix filter-header'>
        <h4 className='filter-title'>{this.props.title}</h4>
        {this.hasQuery(this.props.query) && <button type='button'
                                                    className='btn btn-reset'
                                                    onClick={()=>{this.props.resetFilter()}}>Reset</button>}

      </div>
      );
  }
}

FilterHeader.propTypes = {title: React.PropTypes.string,
                          resetFilter: React.PropTypes.func};
FilterHeader.defaultProps = {searchText: ''};

export default FilterHeader;
