import './FacetDateRange.css';
import React from 'react'
import Facet from './FacetWrapper';
import maxBy from 'lodash.maxby';
import FacetHeader from './FacetHeader';
import DragBar from './DragBar';
import findIndex from 'lodash.findindex';
import defined from '../helpers/defined';

// each facet option has a certain hight in order to calculate drag bar location
const itemHeight = 35;

// the date range facet facet, extends facet component
class FacetDateRange extends Facet {
  constructor(props) {
    super(props);
    this.resetdateFrom = this.resetdateFrom.bind(this);
    this.resetdateTo = this.resetdateTo.bind(this);
    this.onDrag = this.onDrag.bind(this);
    this.setdateFromIndex= this.setdateFromIndex.bind(this);
    this.setdateToIndex = this.setdateToIndex.bind(this);
    this.renderDragBar = this.renderDragBar.bind(this);

    /**
     * @type {object}
     * @property {number} dateFromIndex index of the option that is start date
     * @property {number} dateToIndex index of the option that is end date
     */
    this.state={
      dateFromIndex: -1,
      dateToIndex: -1
    }
  }

  componentWillReceiveProps(nextProps){
    this.setdateFromIndex(nextProps.options, nextProps.location.query.dateFrom);
    this.setdateToIndex(nextProps.options, nextProps.location.query.dateTo);
  }

  setdateFromIndex(options, dateFrom){
    // since the date options is ordered from most recent to least reset, start date index > end date index
    let start = -1;
    if(defined(dateFrom)){
      if(dateFrom === 'undefined'){
        // if enddate is undefined, it should be pointing at "any start date" option
        // take into account the any start date and any end date option
        // the index of any start date is actually the index will be length of valid options + 1
        start = options.length + 1;
      } else{
        start = findIndex(options, o=> +o.value === +dateFrom) + 1;
      }
    }
    this.setState({
      dateFromIndex: start
    });
  }

  setdateToIndex(options, dateTo){
    let end = -1;
    if(defined(dateTo)){
      // if enddate is undefined, it should be pointing at "any end date" option
      if(dateTo === 'undefined'){
        end = 0;
      } else{
        end = findIndex(options, o=> +o.value === +dateTo) + 1;
      }
    }
    this.setState({
      dateToIndex: end
    });
  }

  toggleOption(option, i){
    let currentdateFrom = this.props.location.query.dateFrom;
    let currentdateTo = this.props.location.query.dateTo;
    let optionDate =  option.value;
    let sortedOptions = this.props.options;

    // if neither current start date and end date exists, set selection to both
    if(!currentdateFrom && !currentdateTo){
        this.props.updateQuery({ 'dateFrom': optionDate});
        this.props.updateQuery({ 'dateTo': optionDate});
        this.setdateFromIndex(sortedOptions, optionDate);
        this.setdateToIndex(sortedOptions, optionDate);

    } else if (currentdateFrom === 'undefined') {
        this.props.updateQuery({ 'dateTo': optionDate});
        this.setdateToIndex(sortedOptions, optionDate);
    } else if(currentdateTo === 'undefined'){
        this.props.updateQuery({ 'dateFrom': optionDate});
        this.setdateFromIndex(sortedOptions, optionDate);
    }else {
        if(optionDate < currentdateFrom){
            this.props.updateQuery({ 'dateFrom': optionDate});
            this.setdateFromIndex(sortedOptions, optionDate);
        } else{
            this.props.updateQuery({ 'dateTo': optionDate});
            this.setdateToIndex(sortedOptions, optionDate);
        }
    }
  }

  resetdateFrom(){
    // let sortedOptions = this.props.options;
    this.props.updateQuery({ 'dateFrom': 'undefined' });
  }

  resetdateTo(){
    // let sortedOptions = this.props.options;
    this.props.updateQuery({ 'dateTo': 'undefined' });
  }

  removeFacet(){
    this.props.updateQuery({'dateFrom': []});
    this.props.updateQuery({'dateTo': []});
  }

  /**
   * Check if current facet option is active(exists in the url)
   * @param {object} option the current facet option
   */
  checkActiveOption(option){
    if(!defined(this.props.location.query.dateFrom) && !defined(this.props.location.query.dateFrom)){
        return false;
    }

    // if dateFrom is undefined(lowerbound undefined), and the current value is <= than date to, then it is active
    // same with if dateto undefined
    if((this.props.location.query.dateFrom === 'undefined' && +option.value <= +this.props.location.query.dateTo) ||
      (this.props.location.query.dateTo === 'undefined' && +option.value >= +this.props.location.query.dateFrom)){
        return true
    }

    // if the current option is later than date from, and before date to, then it is active
    if(+option.value >= +this.props.location.query.dateFrom && +option.value <= +this.props.location.query.dateTo){
            return true;
    }

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
            onClick={this.toggleOption.bind(this, option, i)}>
      <span style={divStyle} className='btn-facet-option__volume-indicator'/>
      <span className='btn-facet-option__name'>{option.value}{option.matched && <span className='btn-facet-option__recomended-badge'>(recomended)</span>}</span>
      <span className='btn-facet-option__count'>{option.hitCount}</span>
    </button>)

  }

  /**
   * When dragging the dragbar, update the bar positions and update the url
   * @param {number} id id here indicates bar is dragged therefore which property needs updates. if id === 0, then it the top bar being dragged therefore 'dateTo' should be updated
   * @param {number} value the position relative to the wrapper that the drag bar has been dragged to
   */
  onDrag(id, value){
    // the index of the option that the dragged bar position corresponds to
    let index = Math.floor(value / itemHeight);

    // only updates if the dragged position is within the range
    if(index > 0 && index < this.props.options.length){
      if(id === 0){
        this.props.updateQuery({ 'dateTo': this.props.options[index].value});
      } else{
        this.props.updateQuery({ 'dateFrom': this.props.options[index].value});
      }
    } else{
      if(id=== 0){
        this.props.updateQuery({ 'dateTo': 'undefined'});
      } else {
        this.props.updateQuery({ 'dateFrom': 'undefined'});
      }
    }
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
                         activeOptions={this.props.activeOptions}>
               <FacetSearchBox renderOption={this.renderOption}
                               options={this.props.facetSearchResults}
                               searchFacet={this.props.searchFacet}/>
              {}
               <ul className='list-unstyled'>
                 {that.props.options.map(o=><li key={o.value}>{that.renderOption(o)}</li>)}
               </ul>
           </FacetWrapper>
  }
}

export default FacetDateRange;
