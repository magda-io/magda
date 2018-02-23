import React, { Component } from 'react';
import PropTypes from 'prop-types';
import './ChartConfig.css'
import Option from 'muicss/lib/react/option';
import Select from 'muicss/lib/react/select';
import Input from 'muicss/lib/react/input';

const VEGAMARK = ['area', 'bar', 'circle', 'line', 'point', 'rect', 'square', 'text', 'tick'];
const DATATYPE = ['quantitative', 'temporal', 'ordinal', 'nominal'];

export default class ChartConfig extends Component {
  renderTypeSelect(options,id, label){
      return (<Select name="input" label={label} defaultValue={this.props[id]} onChange = {this.onChange.bind(this, id)}>
          {options.map(o=><Option key={o} value={o} label={o}/>)}
      </Select>)
  }

  onChange(id){

  }

  render(){
    return (<div className='chart-config'>
              <div className='chart-type'>{this.renderTypeSelect(VEGAMARK, 'chartType', 'Chart type')}</div>
              <div className='chart-title'><Input onChange = {this.onChange.bind(this, 'title')} label="Chart title" /></div>
              <div className='y-axis'><Input label="Y axis" onChange = {this.onChange.bind(this, 'xAxis')}/></div>
              <div className='x-axis'><Input label="X axis" onChange = {this.onChange.bind(this, 'yAxis')}/></div>
              <div className='linear'>{this.renderTypeSelect(DATATYPE, 'yScale', 'Chart scale')}</div>
            </div>)
  }
}

ChartConfig.propTypes = {

};
