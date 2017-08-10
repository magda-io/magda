// @flow
import React, { Component } from 'react';
import VegaLite from 'react-vega-lite';
import JsonForm from 'react-json';

const defaultSpec = {
  "description": "Example data",
  "mark": "bar",
  "encoding": {
    "x": {"field": "a", "type": "ordinal"},
    "y": {"field": "b", "type": "quantitative"}
  }
}

class DataPreviewVega extends Component {
  constructor(props) {
    super(props);
    this.state = {
      spec: {
        "description": "",
        "mark": "bar",
        "encoding": {
          "x": {"field": "a", "type": "ordinal"},
          "y": {"field": "b", "type": "quantitative"}
        }
      },
      data:{
        values: [
            {"a": "C", "b": 2}, {"a": "C", "b": 7}, {"a": "C", "b": 4},
            {"a": "D", "b": 1}, {"a": "D", "b": 2}, {"a": "D", "b": 6},
            {"a": "E", "b": 8}, {"a": "E", "b": 4}, {"a": "E", "b": 7}
          ]
        }
    }
    this.logChange = this.logChange.bind(this);
  }

  logChange(){

  }

  componentWillMount(){
    const spec = {
      "description": "",
      "mark": "bar",
      "encoding": {
        "x": {"field": this.props.data.meta.fields[0], "type": "temporal"},
        "y": {"field": this.props.data.meta.fields[1], "type": "quantitative"}
      }
    }

    const data ={
      values: this.props.data.data
    }

    this.setState({
      spec: spec,
      data: data
    })

  }

  renderCharts(){
    debugger
    const settings = {
      form: true,
      fields: {
        description: {type: 'string'},
        mark: {type: 'select', settings: {options: ['bar', 'line']}},
      }
    }
    return (
      <div className="clearfix">
        <div className='vis row'>
          <div className="col-sm-4"><JsonForm value={ this.state.spec } onChange={ this.logChange } settings={settings}/></div>
          <div className="col-sm-8"><VegaLite spec={this.state.spec} data={this.state.data}/></div>
        </div>
      </div>
      )
  }

  render(){
    return <div className='data-preview-vega'>
            {this.renderCharts()}
           </div>
  }
}


export default DataPreviewVega;
