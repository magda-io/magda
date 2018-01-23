import React, { Component } from 'react';
import Dropdown from 'muicss/lib/react/dropdown';
import Input from 'muicss/lib/react/input';
import Button from 'muicss/lib/react/button';
import PropTypes from 'prop-types';
import debounce from 'lodash.debounce';
import './MonthPicker.css';

const MONTH_NAMES = [['Jan', 'Feb', 'Mar'], ['Apr', 'May', 'Jun'], ['Jul', 'Aug', 'Sep'], ['Oct', 'Nov', 'Dec']];

class MonthPicker extends Component {
  constructor(props){
    super(props);
    this.onChange = this.onChange.bind(this);
    this.selectMonth = this.selectMonth.bind(this);
    this.debounceValidateYearField = debounce(this.changeYear, 1000);
    this.state = {
      prompt: '',
      yearValue: ''
    }
  }

  componentWillMount(){
    this.setState({
      yearValue: this.props.year
    })
  }

  componentWillReceiveProps(nextProps){
    this.setState({
      yearValue: nextProps.year
    })
  }

  changeYear(value){
      this.setState({
        prompt: '',
      });
      if(isNaN(value) || value < this.props.yearLower || value > this.props.yearUpper){
        this.setState({
          prompt: `Enter a year between ${this.props.yearLower}-${this.props.yearUpper}`
        })
      } else{
        this.props.selectYear(value);
      }
  }

  onChange(event){
    if(event.target.value.length >= 5){
      return false;
    } else{
      this.setState({
        yearValue: event.target.value
      });
      const value = +event.target.value;
      this.debounceValidateYearField(value);
    }
  }

  selectMonth(month){
    this.props.selectMonth(month);
  }

  renderPrompt(){
    if(this.state.prompt.length > 0){
      return <span className='month-picker-prompt'>{this.state.prompt}</span>
    }
    return null;
  }

  checkMonthValid(year, month){
    const yearLower = this.props.yearLower;
    const yearUpper = this.props.yearUpper;
    const monthUpper = this.props.monthUpper;
    const monthLower = this.props.monthLower;

    if(year > yearUpper || year < yearLower){
      return false;
    } else if(year === yearLower){
      if(month < monthLower){
        return false;
      }
      return true;
    } else if(year === yearUpper){
      if(month > monthUpper){
        return false;
      }
      return true;
    }
    return true;
  }

  render(){
    return (
      <table className='month-picker mui-table'>
        <tbody>
          <tr><th colSpan="3">
          <Input placeholder="select a year" onChange={this.onChange} value={this.state.yearValue}/>{this.renderPrompt()}</th></tr>
          {MONTH_NAMES.map((m, i) => <tr key={m}>
            {m.map((n, j) => <td key={n}><Button disabled={!this.checkMonthValid(+this.state.yearValue, +i * MONTH_NAMES[0].length + j)} onClick={this.selectMonth.bind(this, i * MONTH_NAMES[0].length + j)} className={`btn-facet-option btn-month ${this.props.month === i * MONTH_NAMES[0].length + j? 'is-active' : ''}`}>{n}</Button></td>)}
            </tr>)}
        </tbody>
      </table>)
  }
}

MonthPicker.PropTypes = {
  year: PropTypes.number,
  month: PropTypes.number,
  yearUpper: PropTypes.number,
  yearLower:PropTypes.number,
  monthUpper: PropTypes.number,
  monthLower: PropTypes.number,
  selectMonth: PropTypes.function,
  selectYear: PropTypes.function,
}

export default MonthPicker;
