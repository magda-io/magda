import React from 'react'
import Filter from './Filter';
import maxBy from 'lodash.maxby';


class FilterDateRange extends Filter {
  constructor(props) {
    super(props);
    this.resetStartDate = this.resetStartDate.bind(this);
    this.resetEndDate = this.resetEndDate.bind(this);
  }

  toggleFilter(option){
    let currentStartDate = +this.props.location.query.startDate;
    let currentEndDate = +this.props.location.query.endDate;
    let optionDate = + option.id;
    // if neither current Start date and end date, then set selection to both
    if(!currentEndDate && !currentEndDate){
        this.props.updateQuery({ 'startDate': optionDate});
        this.props.updateQuery({ 'endDate': optionDate});
    } else {
        if(optionDate < currentStartDate){
            this.props.updateQuery({ 'startDate': optionDate});
        } else{
            this.props.updateQuery({ 'endDate': optionDate});
        }
    }
  }

  resetStartDate(){
    this.props.updateQuery({ 'startDate': this.props.options[0].id });
  }

  resetEndDate(){
    this.props.updateQuery({ 'endDate': this.props.options[this.props.options.length-1].id });
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
        if(+option.id === +this.props.location.query.startDate || +option.id === +this.props.location.query.endDate){
            return true;
        }
    }

    if(+option.id >= +this.props.location.query.startDate && +option.id <= +this.props.location.query.endDate){
            return true;
    }
    
    return false;
  }

  renderCondition(option){
    if(!option){
      return null;
    }
    let divStyle = {
      width: +option.hitCount/maxBy(this.props.options, 'hitCount').hitCount * 200 + 'px'
    }

    return <button style={divStyle} type='button' className={`${this.checkActiveOption(option) ? 'is-active' : ''} btn-date-option btn`} onClick={this.toggleFilter.bind(this, option)}>{option.name}</button>;
  }

  render(){

    return (
      <div className='filter'>
        <div className='clearfix filter-header'>
          <h4 className='filter-title'>{this.props.title}</h4>
          <button type='button' className='btn btn-reset' onClick={this.resetFilter} >Reset</button>
        </div>
        <button className='btn' onClick={this.resetStartDate}>Any start date </button>

        <div className='options'>
            {this.state.searchText.length === 0 && this.props.options.map((option, i)=>
                  <div key={i}>{this.renderCondition(option)}</div>
            )}
        </div>
        <button className='btn' onClick={this.resetEndDate}>Any end date </button>
      </div>
    );
  }
}

export default FilterDateRange;
