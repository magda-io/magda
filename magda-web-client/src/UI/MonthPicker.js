import React, { Component } from 'react';
import Dropdown from 'muicss/lib/react/dropdown';
import Input from 'muicss/lib/react/input';
import Button from 'muicss/lib/react/button';
import './MonthPicker.css';

const MONTH_NAMES = [['Jan', 'Feb', 'Mar'], ['Apr', 'May', 'Jun'], ['Jul', 'Aug', 'Sep'], ['Oct', 'Nov', 'Dec']];

class MonthPicker extends Component {
  constructor(props){
    super(props);
  }

  changeYear(event){
      this.props.selectYear(event.target.value);
  }

  selectMonth(event){
    this.props.selectMonth(event.target.value);
  }

  render(){
    const year = this.props.date.getUTCFullYear();
    const month = this.props.date.getUTCMonth();
    return (
      <table className='month-picker mui-table'>
        <tbody>
          <tr><th colSpan="3"><Input placeholder="select a year"  defaultValue={year} /></th></tr>
          {MONTH_NAMES.map((m, i) => <tr key={m}>
            {m.map((n, j) => <td key={n}><Button variant='flat'  className={month === i * MONTH_NAMES[0].length + j? 'is-active' : ''}>{n}</Button></td>)}
            </tr>)}
        </tbody>
      </table>)
  }
}


export default MonthPicker;
