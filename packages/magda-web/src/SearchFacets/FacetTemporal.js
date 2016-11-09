import './FacetTemporal.css';
import React, { Component } from 'react';
import FacetWrapper from './FacetWrapper';
import maxBy from 'lodash.maxby';
import FacetHeader from './FacetHeader';
import DragBar from './DragBar';
import findIndex from 'lodash.findindex';
import defined from '../helpers/defined';

// each facet option has a certain hight in order to calculate drag bar location
const itemHeight = 35;

// the date range facet facet, extends facet component
class FacetTemporal extends Component {
  constructor(props) {
    super(props);
  }

  /**
   * Check if current facet option is active(exists in the url)
   * @param {object} option the current facet option
   */
  checkActiveOption(option){
    return false;
  }

  renderOption(option, i){
    if(!option){
      return null;
    }
    let divStyle = {
      width: +option.hitCount/maxBy(this.props.options, 'hitCount').hitCount * 160 + 'px'
    }

    return (
    <button type='button'
            className={`${this.checkActiveOption(option) ? 'is-active' : ''} btn-facet-option btn-facet-date-option btn`}
            onClick={this.props.toggleOption.bind(this, option, i)}>
      <span style={divStyle} className='btn-facet-option__volume-indicator'/>
      <span className='btn-facet-option__name'>{option.value}</span>
      <span className='btn-facet-option__count'>{option.hitCount}</span>
    </button>)

  }

  /**
   * When dragging the dragbar, update the bar positions and update the url
   * @param {number} id id here indicates bar is dragged therefore which property needs updates. if id === 0, then it the top bar being dragged therefore 'dateTo' should be updated
   * @param {number} value the position relative to the wrapper that the drag bar has been dragged to
   */
  onDrag(id, value){
  }

  renderDragBar(){
    // the height of the dragbar should be the same with the height of all the options + any start date + any end date
    // remove last padding
    let height = (this.props.options.length + 2) * itemHeight - 2;
    // [endPos, startPos]
    let dragBarData=[(this.state.dateToIndex * itemHeight), (this.state.dateFromIndex * itemHeight)];
    return <DragBar dragBarData={dragBarData} onDrag={this.onDrag} height={height}/>
  }

  render(){
    let that = this;
    return <FacetWrapper onResetFacet={this.props.onResetFacet}
                         title={this.props.title}
                         activeOptions={this.props.activeOptions}
                         hasQuery={this.props.hasQuery}>
               <ul className='list-unstyled'>
                 {that.props.options.map(o=><li key={o.value}>{that.renderOption(o)}</li>)}
               </ul>
           </FacetWrapper>
  }
}

export default FacetTemporal;
