import Filter from './Filter';
import maxBy from 'lodash.maxby';
import React from 'react';



class FilterDataFormat extends Filter {
    // renderCondition(option){
    // if(!option){
    //       return null;
    //     }
    //     let divStyle = {
    //       width: +option.hitCount/maxBy(this.props.options, 'hitCount').hitCount * 200 + 'px'
    //     }

    //     return <button style={divStyle} type='button' className={`${this.checkActiveOption(option) ? 'is-active' : ''} btn-date-option btn`} onClick={this.toggleFilter.bind(this, option)}>{option.name}</button>;
    //   }

}

export default FilterDataFormat;
