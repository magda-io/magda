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
    this.state = {spec: undefined}
    this.logChange = this.logChange.bind(this);
  }


  logChange(data){
    // need to validate data
    this.setState({
      spec: data
    })
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
          <div className="col-sm-8"><VegaLite spec={this.state.spec} data={this.props.data}/></div>
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
            data={this.props.data.values}
            columns={columns}
          />
        </div>
    </div>
    )
  }

  visualisable(){
    return !this.props.isFetching && !this.props.error && this.state.spec;
  }

  render(){
    return (<div className='dataset-preview container'>
                  {this.visualisable() && this.renderCharts()}
                  {this.visualisable() && this.renderTable()}
                  {this.props.error && <div> Error</div>}
            </div>)
  }
}

function mapStateToProps(state) {
  const previewData= state.previewData;
  const data = previewData.previewData;
  const loading = previewData.isFetching;
  const error = previewData.error;
  return {
    data, loading, error
  };
}

export default connect(mapStateToProps)(DatasetVisualisation);
