import React from 'react'
import Filter from './Filter';
import maxBy from 'lodash.maxby';
import FilterHeader from './FilterHeader';
import DragBar from './DragBar';
import findIndex from 'lodash.findindex';

const itemHeight = 32;
const r = 30;


class FilterDateRange extends Filter {
  constructor(props) {
    super(props);
    this.resetStartDate = this.resetStartDate.bind(this);
    this.resetEndDate = this.resetEndDate.bind(this);
    this.updateDragBar = this.updateDragBar.bind(this);
    this.setStartDateIndex= this.setStartDateIndex.bind(this);
    this.setEndDateIndex = this.setEndDateIndex.bind(this);
    this.renderDragBar = this.renderDragBar.bind(this);

    this.state={
      searchText: '',
      startDateIndex: -1,
      endDateIndex: -1
    }
  }

  componentWillReceiveProps(nextProps){
    let sortedOptions = nextProps.options.sort((a,b)=>+a.value - b.value);
    this.setStartDateIndex(sortedOptions, nextProps.location.query.startDate);
    this.setEndDateIndex(sortedOptions, nextProps.location.query.endDate);
  }

  setStartDateIndex(options, startDate){
    let start = startDate ? findIndex(options, o=> +o.value == +startDate) : -1;
    this.setState({
      startDateIndex: start
    });
  }

  setEndDateIndex(options, endDate){
    let end = endDate ? findIndex(options, o=> +o.value == +endDate) : -1;
    this.setState({
      endDateIndex: end
    });
  }

  toggleFilter(option, i){
    let currentStartDate = +this.props.location.query.startDate;
    let currentEndDate = +this.props.location.query.endDate;
    let optionDate = + option.value;
    let data = this.state.dragBarData;
    let sortedOptions = this.props.options.sort((a,b)=>+a.value - b.value);

    // if neither current Start date and end date, then set selection to both
    if(!currentStartDate && !currentEndDate){
        this.props.updateQuery({ 'startDate': optionDate});
        this.props.updateQuery({ 'endDate': optionDate});
        this.setStartDateIndex(sortedOptions, optionDate);
        this.setEndDateIndex(sortedOptions, optionDate);

    } else {
        if(optionDate < currentStartDate){
            this.props.updateQuery({ 'startDate': optionDate});
            this.setStartDateIndex(sortedOptions, optionDate);
        } else{
            this.props.updateQuery({ 'endDate': optionDate});
            this.setEndDateIndex(sortedOptions, optionDate);
        }
    }
  }

  resetStartDate(){
    let sortedOptions = this.props.options.sort((a,b)=>+a.value - b.value);
    this.props.updateQuery({ 'startDate': sortedOptions[0].value });
  }

  resetEndDate(){
    let sortedOptions = this.props.options.sort((a,b)=>+a.value - b.value);
    this.props.updateQuery({ 'endDate': sortedOptions[sortedOptions-1].value });
  }

  resetFilter(){
    this.props.updateQuery({'startDate': []});
    this.props.updateQuery({'endDate': []});
  }

  checkActiveOption(option){

    if(!this.props.location.query.startDate && !this.props.location.query.startDate){
        return false;
    }
    if(this.props.location.query.startDate === 'any' || this.props.location.query.endDate === 'any'){
        if(+option.value === +this.props.location.query.startDate || +option.value === +this.props.location.query.endDate){
            return true;
        }
    }

    if(+option.value >= +this.props.location.query.startDate && +option.value <= +this.props.location.query.endDate){
            return true;
    }

    return false;
  }

  renderCondition(option, i){
    if(!option){
      return null;
    }
    let divStyle = {
      width: +option.hitCount/maxBy(this.props.options, 'hitCount').hitCount * 200 + 'px'
    }

    return <button style={divStyle} type='button' className={`${this.checkActiveOption(option) ? 'is-active' : ''} btn-date-option btn`} onClick={this.toggleFilter.bind(this, option, i )}>{option.value}</button>;
  }

  updateDragBar(id, value){
    let index = Math.round(value / itemHeight);
    let sortedOptions = this.props.options.sort((a,b)=>+a.value - b.value);
    if(id === 0){
      this.setStartDateIndex(sortedOptions, index);
      this.props.updateQuery({ 'startDate': sortedOptions[index].value});
    } else{
      this.setEndDateIndex(sortedOptions, index);
      this.props.updateQuery({ 'endDate': sortedOptions[index].value});
    }
  }

  renderDragBar(){
    let height = this.props.options.length * itemHeight;
    let dragBarData=[+this.state.startDateIndex* itemHeight, (+this.state.endDateIndex - 1)* itemHeight];

    if(this.state.startDateIndex !== -1 && this.state.endDateIndex !== -1){
      return <DragBar dragBarData={dragBarData} updateDragBar={this.updateDragBar} height={height}/>
    }
    return null;
  }

  render(){
    return (
      <div className='filter'>
        <FilterHeader query={this.props.location.query.startDate}
                      resetFilter={this.resetFilter}
                      title={this.props.title}/>
        <button className='btn' onClick={this.resetStartDate}>Any start date </button>
        {(this.state.searchText.length === 0) &&
            <div className='clearfix' id='drag-bar'>
              <div className='slider'>
                {this.renderDragBar()}
              </div>
              <div className='list'>
                <div className='options'>
                  {this.props.options.sort((a,b)=>+a.value - b.value).map((option, i)=>
                        <div key={i}>{this.renderCondition(option, i)}</div>
                  )}
                </div>
            </div>
        </div>}

        <button className='btn' onClick={this.resetEndDate}>Any end date </button>
      </div>
    );
  }
}

export default FilterDateRange;
