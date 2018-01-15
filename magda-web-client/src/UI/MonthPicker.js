import React, { Component } from 'react';
import Dropdown from 'muicss/lib/react/dropdown';
import Input from 'muicss/lib/react/input';
import Button from 'muicss/lib/react/button';
import './MonthPicker.css';

const MONTH_NAMES = [['Jan', 'Feb', 'Mar'], ['Apr', 'May', 'Jun'], ['Jul', 'Aug', 'Sep'], ['Oct', 'Nov', 'Dec']];

class MonthPicker extends Component {
  constructor(props){
    super(props);
    this.changeYear = this.changeYear.bind(this);
    this.selectMonth = this.selectMonth.bind(this);
  }

  changeYear(event){
      this.props.selectYear(event.target.value);
  }

  selectMonth(month){
    this.props.selectMonth(month);
  }

  render(){
    const year = this.props.year;
    const month = this.props.month;
    return (
      <table className='month-picker mui-table'>
        <tbody>
          <tr><th colSpan="3"><Input placeholder="select a year"  defaultValue={year}  onChange={this.changeYear}/></th></tr>
          {MONTH_NAMES.map((m, i) => <tr key={m}>
            {m.map((n, j) => <td key={n}><Button variant='flat'  onClick={this.selectMonth.bind(this, i * MONTH_NAMES[0].length + j)} className={`btn-month ${month === i * MONTH_NAMES[0].length + j? 'is-active' : ''}`}>{n}</Button></td>)}
            </tr>)}
        </tbody>
      </table>)
  }
}


export default MonthPicker;
