import React, { Component } from 'react';
import { connect } from 'react-redux';
import fetch from 'isomorphic-fetch'
import {fetchPreviewData} from '../actions/previewDataActions'
import { bindActionCreators } from 'redux';
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
    this.state = {spec: {
        "description": "",
        "mark": "bar",
        "encoding": {
          "x": {"field": "", "type": "ordinal"},
          "y": {"field": "", "type": "quantitative"}
        }
      }
    }
    this.logChange = this.logChange.bind(this);
  }


  logChange(data){
    // need to validate data
    this.setState({
      spec: data
    })
  }

  componentWillMount(){
    this.props.fetchPreviewData(this.props.dataset.distributions);
  }

  componentWillReceiveProps(nextProps){
      if(nextProps.dataset.identifier !== nextProps.dataset.id){
        this.props.fetchPreviewData(nextProps.dataset.distributions);
      }
  }

  renderCharts(){
    const settings = {
      form: true,
      fields: {
        description: {type: 'string'},
        mark: {type: 'select', settings: {options: ['bar', 'line']}},
      }
    }
    function renderVegaChart(spec, data){
      return <div className="col-sm-8"><VegaLite spec={spec} data={data}/></div>
    }
    return (
      <div className="clearfix">
        <h3 className='section-heading'>{this.state.spec.description}</h3>
        <div className='vis row'>
          <div className="col-sm-4"><JsonForm value={ this.state.spec } onChange={ this.logChange } settings={settings}/></div>
        </div>
      </div>
      )
  }

  renderTable(){
    const columns = this.props.data.meta.fields.map((item)=> ({
      Header: item, accessor: item
    }))
    debugger
    return (
      <div className="clearfix">
        <h3 className='section-heading'>{'data table'}</h3>
        <div className='vis'>
          <ReactTable
            minRows={3}
            data={this.props.data.data}
            columns={columns}
          />
        </div>
    </div>
    )
  }

  visualisable(){
    return !this.props.isFetching && !this.props.error && this.props.data;
  }

  render(){
    return (<div className='dataset-preview container'>
                  {this.visualisable() && this.renderTable()}
                  {this.props.error && <div> Error</div>}
            </div>)
  }
}

function mapStateToProps(state) {
  const dataset = state.record.dataset;
  const previewData= state.previewData;
  const data = previewData.previewData;
  const loading = previewData.isFetching;
  const error = previewData.error;
  return {
    data, loading, error, dataset
  };
}

const  mapDispatchToProps = (dispatch: Dispatch<*>) => {
  return bindActionCreators({
    fetchPreviewData: fetchPreviewData,
  }, dispatch);
}

export default connect(mapStateToProps, mapDispatchToProps)(DatasetVisualisation);
