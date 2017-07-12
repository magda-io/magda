import React, { Component } from 'react';
import { connect } from 'react-redux';
import fetch from 'isomorphic-fetch'
import VegaLite from 'react-vega-lite';
import ReactTable from 'react-table';
import JsonForm from 'react-json';
import '../UI/ReactTable.css';
import './DatasetVisualisation.css'

const defaultSpec = {
  "description": "Example data",
  "mark": "bar",
  "encoding": {
    "x": {"field": "a", "type": "ordinal"},
    "y": {"field": "b", "type": "quantitative"}
  }
}

class DatasetVisualisation extends Component {

  constructor(props) {
    super(props);
    this.state = {spec: defaultSpec, loading: true, loadDataSuccess: false};
    this.logChange = this.logChange.bind(this);
  }


  logChange(data){
    // need to validate data
    this.setState({
      spec: data
    })
  }

  render(){
    const barData = {
      "values": [
        {"a": "A","b": 20}, {"a": "B","b": 34}, {"a": "C","b": 55},
        {"a": "D","b": 19}, {"a": "E","b": 40}, {"a": "F","b": 34},
        {"a": "G","b": 91}, {"a": "H","b": 78}, {"a": "I","b": 25}
      ]
    };

    const columns = [
      {Header: 'a', accessor: 'a'},
      {Header: 'b', accessor: 'b'}
    ]

    const settings = {
      form: true,
      fields: {
        description: {type: 'string'},
        mark: {type: 'select', settings: {options: ['bar', 'line']}},
      }
    }
    return (<div className='dataset-preview container'>
                  <div className="clearfix">
                    <h3 className='section-heading'>{this.state.spec.description}</h3>
                    <div className='vis row'>
                      <div className="col-sm-8"><VegaLite spec={this.state.spec} data={barData}/></div>
                      <div className="col-sm-4"><JsonForm value={ this.state.spec } onChange={ this.logChange } settings={settings}/></div>
                    </div>
                  </div>
                  <div className="clearfix">
                    <h3 className='section-heading'>{this.state.spec.description}</h3>
                    <div className='vis'>
                      <ReactTable
                        minRows={3}
                        data={barData.values}
                        columns={columns}
                      />
                    </div>
                </div>
            </div>)
  }
}

function mapStateToProps(state) {
  const record= state.record;
  const dataset = record.dataset;
  return {
    dataset
  };
}

export default connect(mapStateToProps)(DatasetVisualisation);
