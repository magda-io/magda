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
    const year = this.props.date.getFullYear();
    const month = this.props.date.getMonth();
    return (
      <table className='month-picker mui-table'>
        <th colSpan="3"><Input placeholder="select a year" defaultValue={year} /></th>
          <tbody>
            {MONTH_NAMES.map((m, i) => <tr>
              {m.map((n, j) => <td><Button variant='flat' className={month === i * MONTH_NAMES.length + j? 'is-active' : ''}>{n}</Button></td>)}
          </tr>)}
        </tbody>
      </table>)
  }
}


export default MonthPicker;
