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
    const dateFrom = defined(this.props.activeDates[0]) ? new Date(this.props.activeDates[0]) : new Date();
    const dateTo = defined(this.props.activeDates[1]) ? new Date(this.props.activeDates[1]) : new Date();

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
    const dates = [this.state.startYear + '-' + (this.state.startMonth + 1) + '-' +'01', this.state.endYear + '-' + (this.state.endMonth + 1) + '-' +'01'];
    this.props.onToggleOption(dates);
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
              <MonthPicker year={this.state.startYear} month={this.state.startMonth} selectYear={this.selectStartYear} selectMonth={this.selectStartMonth}/>
              <div><img src = '' alt='seperater'/></div>
              <MonthPicker year={this.state.endYear} month={this.state.endMonth} selectYear={this.selectEndYear} selectMonth={this.selectEndMonth}/>
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
