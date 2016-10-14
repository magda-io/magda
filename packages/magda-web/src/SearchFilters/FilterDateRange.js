import './FilterDateRange.css';
import React from 'react'
import Filter from './Filter';
import maxBy from 'lodash.maxby';
import FilterHeader from './FilterHeader';
import DragBar from './DragBar';
import findIndex from 'lodash.findindex';
import defined from './../defined';

const itemHeight = 35;

class FilterDateRange extends Filter {
  constructor(props) {
    super(props);
    this.resetdateFrom = this.resetdateFrom.bind(this);
    this.resetdateTo = this.resetdateTo.bind(this);
    this.updateDragBar = this.updateDragBar.bind(this);
    this.setdateFromIndex= this.setdateFromIndex.bind(this);
    this.setdateToIndex = this.setdateToIndex.bind(this);
    this.renderDragBar = this.renderDragBar.bind(this);

    this.state={
      searchText: '',
      dateFromIndex: -1,
      dateToIndex: -1
    }
  }

  componentWillReceiveProps(nextProps){
    let sortedOptions = nextProps.options;
    this.setdateFromIndex(sortedOptions, nextProps.location.query.dateFrom);
    this.setdateToIndex(sortedOptions, nextProps.location.query.dateTo);
  }

  setdateFromIndex(options, dateFrom){
    let start = -1;
    if(defined(dateFrom)){
      if(dateFrom === 'undefined'){
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

  toggleFilter(option, i){
    let currentdateFrom = +this.props.location.query.dateFrom;
    let currentdateTo = +this.props.location.query.dateTo;
    let optionDate = + option.value;
    let sortedOptions = this.props.options;
    // if neither current Start date and end date, then set selection to both
    if(!currentdateFrom && !currentdateTo){
        this.props.updateQuery({ 'dateFrom': optionDate});
        this.props.updateQuery({ 'dateTo': optionDate});
        this.setdateFromIndex(sortedOptions, optionDate);
        this.setdateToIndex(sortedOptions, optionDate);

    } else {
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

  resetFilter(){
    this.props.updateQuery({'dateFrom': []});
    this.props.updateQuery({'dateTo': []});
  }

  checkActiveOption(option){

    if(!this.props.location.query.dateFrom && !this.props.location.query.dateFrom){
        return false;
    }
    if(this.props.location.query.dateFrom === 'any' || this.props.location.query.dateTo === 'any'){
        if(+option.value === +this.props.location.query.dateFrom || +option.value === +this.props.location.query.dateTo){
            return true;
        }
    }

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
    <button type='button' className={`${this.checkActiveOption(option) ? 'is-active' : ''} btn-facet-option btn-facet-date-option btn`}           onClick={this.toggleFilter.bind(this, option, i)}>
      <span style={divStyle} className='btn-facet-option__volume-indicator'/>
      <span className='btn-facet-option__name'>{option.value}{option.matched && <span className='btn-facet-option__recomended-badge'>(recomended)</span>}</span>
      <span className='btn-facet-option__count'>{option.hitCount}</span>
    </button>)

  }

  updateDragBar(id, value){
    let index = Math.floor(value / itemHeight);
    let sortedOptions = this.props.options;
    if(index > 0 && index < sortedOptions.length){
      if(id === 0){
        this.props.updateQuery({ 'dateTo': sortedOptions[index].value});
      } else{
        this.props.updateQuery({ 'dateFrom': sortedOptions[index].value});
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
    let height = (this.props.options.length + 2) * itemHeight;

    // [endPos, startPos]
    let dragBarData=[(this.state.dateToIndex * itemHeight), (this.state.dateFromIndex * itemHeight)];
    return <DragBar dragBarData={dragBarData} updateDragBar={this.updateDragBar} height={height}/>
  }

  render(){
    return (
      <div className='filter'>
        <FilterHeader query={this.props.location.query.dateFrom}
                      resetFilter={this.resetFilter}
                      title={this.props.title}/>

        {(this.state.searchText.length === 0) &&
            <div className='clearfix' id='drag-bar'>
              <div className='slider'>
                {this.renderDragBar()}
              </div>
              <div className='list'>
                <div className='options'>
                <div> <button className='btn btn-facet-option btn-facet-date-option' onClick={this.resetdateTo}>Any end date </button></div>
                  {this.props.options.map((option, i)=>
                        <div key={i}>{this.renderOption(option, i)}</div>
                  )}
                <div> <button className='btn btn-facet-option btn-facet-date-option' onClick={this.resetdateFrom}>Any start date </button></div>
                </div>
            </div>
        </div>}

      </div>
    );
  }
}

export default FilterDateRange;
