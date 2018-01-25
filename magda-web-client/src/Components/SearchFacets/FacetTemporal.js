import './FacetTemporal.css';
import React, { Component } from 'react';
import FacetHeader from './FacetHeader';
import defined from '../../helpers/defined';
import Button from 'muicss/lib/react/button';
import MonthPicker from '../../UI/MonthPicker';

// the date range facet facet, extends facet component
class FacetTemporal extends Component {
  constructor(props) {
    super(props);
    this.onClearDates = this.onClearDates.bind(this);
    this.onApplyFilter = this.onApplyFilter.bind(this);
    this.selectStartYear = this.selectStartYear.bind(this);
    this.selectEndYear = this.selectEndYear.bind(this);
    this.selectStartMonth = this.selectStartMonth.bind(this);
    this.selectEndMonth = this.selectEndMonth.bind(this);
    this.state = {
      startYear: undefined,
      startMonth: undefined,
      endYear: undefined,
      endMonth: undefined
    }
  }

  componentWillReceiveProps(nextProps){
    const dateFrom = defined(this.props.activeDates[0]) ? new Date(this.props.activeDates[0]) : new Date('1994-05-17');
    const dateTo = defined(this.props.activeDates[1]) ? new Date(this.props.activeDates[1]) : new Date('2018-03-17');

    this.setState({
      startYear: dateFrom.getUTCFullYear(),
      startMonth: dateFrom.getUTCMonth(),
      endYear: dateTo.getUTCFullYear(),
      endMonth: dateTo.getUTCMonth()
    })
  }

  onClearDates(){
    let datesArray = [undefined, undefined]
    this.props.onToggleOption(datesArray);
  }

  onApplyFilter(){
    const dateFrom = new Date(this.state.startYear, this.state.startMonth);
    const dateTo = new Date(this.state.endYear, this.state.endMonth);
    this.props.onToggleOption([dateFrom.toISOString(), dateTo.toISOString()]);
  }

  selectStartYear(startYear){
    this.setState({
      startYear
    })
  }

  selectEndYear(endYear){
    this.setState({
      endYear
    })
  }

  selectStartMonth(startMonth){
    this.setState({
      startMonth
    })
  }

  selectEndMonth(endMonth){
    this.setState({
      endMonth
    })
  }

  renderDatePicker(){
    return (<div className='facet-temporal-month-picker'>
              <MonthPicker showingDefault = {!this.props.hasQuery} year={this.state.startYear} month={this.state.startMonth} yearLower={1994} yearUpper={this.state.endYear} monthLower = {5} monthUpper = {this.state.endMonth} selectYear={this.selectStartYear} selectMonth={this.selectStartMonth}/>
              <div><img src = '' alt='seperater'/></div>
              <MonthPicker showingDefault = {!this.props.hasQuery} year={this.state.endYear} month={this.state.endMonth} yearLower={this.state.startYear} yearUpper={2018} monthLower = {this.state.startMonth} monthUpper = {3} selectYear={this.selectEndYear} selectMonth={this.selectEndMonth}/>
            </div>)
  }
  render(){
    let that = this;
    return <div className='facet-wrapper'>
            <FacetHeader onResetFacet={this.props.onResetFacet}
                     title={this.props.title}
                     activeOptions={this.props.activeDates}
                     hasQuery={this.props.hasQuery}
                     onClick={this.props.toggleFacet}/>
             {this.props.isOpen &&
             <div className='clearfix facet-temporal facet-body'>
              {this.renderDatePicker()}
              <div className='facet-footer'>
                  <Button variant="flat" onClick={this.props.onResetFacet}> Clear </Button>
                  <Button variant="flat" onClick={this.onApplyFilter}> Apply </Button>
              </div>
             </div>
           }
           </div>
  }
}

export default FacetTemporal;
