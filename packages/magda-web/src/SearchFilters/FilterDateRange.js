import React from 'react'
import Filter from './Filter';
import maxBy from 'lodash.maxby';
import FilterHeader from './FilterHeader';
import DragBar from './DragBar';


class FilterDateRange extends Filter {
  constructor(props) {
    super(props);
    this.resetStartDate = this.resetStartDate.bind(this);
    this.resetEndDate = this.resetEndDate.bind(this);
    this.state={
      searchText: '',
      startDatePos: undefined,
      endDatePos: undefined
    }
  }


  toggleFilter(option, i){
    let currentStartDate = +this.props.location.query.startDate;
    let currentEndDate = +this.props.location.query.endDate;
    let optionDate = + option.value;
    // if neither current Start date and end date, then set selection to both
    if(!currentStartDate && !currentEndDate){
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
    this.props.updateQuery({ 'startDate': this.props.options[0].value });
  }

  resetEndDate(){
    this.props.updateQuery({ 'endDate': this.props.options[this.props.options.length-1].value });
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

    return <button style={divStyle} type='button' className={`${this.checkActiveOption(option) ? 'is-active' : ''} btn-date-option btn`} onClick={this.toggleFilter.bind(this, option, i)}>{option.value}</button>;
  }

  render(){
    // temp, 32 is the height of each option
    let height = this.props.options.length * 32;
    return (
      <div className='filter'>
        <FilterHeader query={this.props.location.query['startDate']}
                      resetFilter={this.resetFilter}
                      title={this.props.title}/>
        <button className='btn' onClick={this.resetStartDate}>Any start date </button>
        {this.state.searchText.length === 0 &&
            <div className='clearfix' id='drag-bar'>
              <div className='col-xs-1'>
                <DragBar startDatePos={this.state.startDatePos} endDatePos={this.state.endDatePos} height={height}/>
              </div>
              <div className='col-xs-11'>
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
