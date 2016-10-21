import React, { Component } from 'react';
import defined from '../defined';
/**
  * Filter header component, contains a title of the filter and a reset button when there is a active filter
  */
class FilterHeader extends Component {
  hasQuery(query){
    // if query is undefined, or if query is[], or [undefined, undefined], then no need to render reset button
    // if query is defined, then render reset button
    if (!defined(query)){
      return false;
    }
    else if(query.length === 0){
      return false;
    }

    else if(!defined(query[0]) && !defined(query[1])){
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
                                                    onClick={()=>{this.props.removeFilter()}}>Reset</button>}

      </div>
      );
  }
}

FilterHeader.propTypes = {title: React.PropTypes.string,
                          removeFilter: React.PropTypes.func};
FilterHeader.defaultProps = {title: ''};

export default FilterHeader;
