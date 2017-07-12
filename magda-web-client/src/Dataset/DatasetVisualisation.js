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
    this.state = {spec: undefined, loading: true, loadDataSuccess: false, data: null};
    this.logChange = this.logChange.bind(this);
  }


  logChange(data){
    // need to validate data
    this.setState({
      spec: data
    })
  }

  componentWillMount(){
    debugger
  }

  renderCharts(){
    const settings = {
      form: true,
      fields: {
        description: {type: 'string'},
        mark: {type: 'select', settings: {options: ['bar', 'line']}},
      }
    }
    return (
      <div className="clearfix">
        <h3 className='section-heading'>{this.state.spec.description}</h3>
        <div className='vis row'>
          <div className="col-sm-8"><VegaLite spec={this.state.spec} data={this.state.data}/></div>
          <div className="col-sm-4"><JsonForm value={ this.state.spec } onChange={ this.logChange } settings={settings}/></div>
        </div>
      </div>
      )
  }

  renderTable(){
    // calculate column heading
    const columns = [
      {Header: 'a', accessor: 'a'},
      {Header: 'b', accessor: 'b'}
    ]

    return (
      <div className="clearfix">
        <h3 className='section-heading'>{this.state.spec.description}</h3>
        <div className='vis'>
          <ReactTable
            minRows={3}
            data={this.state.data.values}
            columns={columns}
          />
        </div>
    </div>
    )
  }

  render(){
    return (<div className='dataset-preview container'>
                  {this.state.loadDataSuccess && this.renderCharts()}
                  {this.state.loadDataSuccess && this.renderTable()}
                  {!this.state.loading && !this.state.loadDataSuccess && <div> No preview available</div>}
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
