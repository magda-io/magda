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
    this.onApplyDates = this.onApplyDates.bind(this);
  }

  onClearDates(){
    let datesArray = [undefined, undefined]
    this.props.onToggleOption(datesArray);
  }

  onApplyDates(dates){
    this.props.onToggleOption(dates);
  }

  selectYear(index, year){
  }

  selectMonth(){

  }

  renderDatePicker(){
    const dateFrom = defined(this.props.activeDates[0]) ? new Date(this.props.activeDates[0]) : new Date();
    const dateTo = defined(this.props.activeDates[1]) ? new Date(this.props.activeDates[1]) : new Date();
    return (<div className='facet-temporal-month-picker'>
              <MonthPicker date={dateFrom} selectYear={this.selectYear} selectMonth={this.selectMonth}/>
              <div><img src = '' alt='seperater'/></div>
              <MonthPicker date={dateTo} selectYear={this.selectYear} selectMonth={this.selectMonth}/>
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
                  <Button variant="flat" onClick={this.props.onResetFacet}> Apply </Button>
              </div>
             </div>
           }
           </div>
  }
}

export default FacetTemporal;
