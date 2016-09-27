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
    this.state={
      searchText: '',
      dragBarData: undefined
    }
  }

  componentWillReceiveProps(nextProps){
    // get index from props
    let startIndex = findIndex(nextProps.options, o=> +o.value == +nextProps.location.query.startDate);
    let endIndex = findIndex(nextProps.options, o=> +o.value == +nextProps.location.query.endDate);
    this.setState({
      dragBarData: [
        {id: 0, y: startIndex*itemHeight + r/2},
        {id: 1, y: endIndex*itemHeight + r/2}
      ]
    })
  }


  toggleFilter(option, i){
    let currentStartDate = +this.props.location.query.startDate;
    let currentEndDate = +this.props.location.query.endDate;
    let optionDate = + option.value;
    let data = this.state.dragBarData;

    // if neither current Start date and end date, then set selection to both
    if(!currentStartDate && !currentEndDate){
        this.props.updateQuery({ 'startDate': optionDate});
        this.props.updateQuery({ 'endDate': optionDate});
        data.map(d=>{d.y = i*itemHeight + r/2; return d});

    } else {
        if(optionDate < currentStartDate){
            this.props.updateQuery({ 'startDate': optionDate});
            data[0].y = i * itemHeight + r/2;
        } else{
            this.props.updateQuery({ 'endDate': optionDate});
            data[1].y = i * itemHeight + r/2;
        }
    }
    this.setState({
      dragBarData: data
    });
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

    return <button style={divStyle} type='button' className={`${this.checkActiveOption(option) ? 'is-active' : ''} btn-date-option btn`} onClick={this.toggleFilter.bind(this, option, i )}>{option.value}</button>;
  }

  updateDragBar(id, value){
    let index = Math.round(value / itemHeight);
    this.toggleFilter(this.props.options[index], index);
  }

  render(){
    // temp, 32 is the height of each option
    let height = this.props.options.length * itemHeight;
    return (
      <div className='filter'>
        <FilterHeader query={this.props.location.query['startDate']}
                      resetFilter={this.resetFilter}
                      title={this.props.title}/>
        <button className='btn' onClick={this.resetStartDate}>Any start date </button>
        {(this.state.searchText.length === 0 && this.state.dragBarData) &&
            <div className='clearfix' id='drag-bar'>
              <div className='col-xs-1'>
                <DragBar dragBarData={this.state.dragBarData} updateDragBar={this.updateDragBar} height={height}/>
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
