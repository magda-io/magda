import 'es6-symbol/implement';
import React, { Component } from 'react';
import Tabs from 'muicss/lib/react/tabs';
import Tab from 'muicss/lib/react/tab';
import ChartConfig from './ChartConfig';
import defined from '../helpers/defined';
import {fetchPreviewData} from '../actions/previewDataActions';
import { connect } from 'react-redux';
import { bindActionCreators } from 'redux';
import VegaLite from 'react-vega-lite';
import DataPreviewTable from './DataPreviewTable';
import './DataPreviewVis.css';

class DataPreviewVis extends Component {
  constructor(props) {
    super(props);
    this.state = {
      chartType: 'line',
      chartTitle: '',
      Yaxis: '',
      xAxis: '',
      xScale: 'temporal',
      yScale: 'quantitative',
    }
  }

  componentWillMount(){
    if(this.props.distribution){
      this.props.fetchPreviewData(this.props.distribution);
    }
  }

  componentWillReceiveProps(nextProps){
    if(nextProps.distribution.identifier !== this.props.distribution.identifier){
        this.props.fetchPreviewData(nextProps.distribution);
      }
  }

  onChange(i, value, tab, ev) {

  }

  onActive(tab) {
  }

  renderChart(previewData){
    if(defined(previewData.meta.chartFields)){
      const spec = {
        "height": 200,
        "description": this.state.title,
        "mark": this.state.chartType,
        "encoding": {
          "x": {"field": previewData.meta.chartFields.time[0], "type": this.state.xScale},
          "y": {"field": previewData.meta.chartFields.numeric[0], "type": this.state.yScale}
        }
      }

      const data ={
        values: previewData.data
      }

      return (<div className='mui-row'>
                <div className='mui-col-sm-6'><VegaLite spec={spec} data={data}/></div>
                <div className='mui-col-sm-6'><ChartConfig chartType={this.state.chartType}
                                                           chartTitle={this.state.chartTitle}
                                                           xScale={this.state.xScale}
                                                           yScale={this.state.yScale}/></div>
              </div>)
    }
    return <div>no chart here</div>

  }

  renderTable(previewData){
    return <DataPreviewTable data={previewData}/>
  }

  renderByState(){
    if(this.props.data && this.props.distribution && this.props.distribution.identifier){
      const previewData = this.props.data[this.props.distribution.identifier];
      if(previewData){
        return (
          <Tabs onChange={this.onChange} defaultSelectedIndex={defined(previewData.meta.chartFields)}>
            <Tab value="table" label="Table" onActive={this.onActive}>{this.renderTable(previewData)}</Tab>
            <Tab value="chart" label="Chart" >{this.renderChart(previewData)}</Tab>
          </Tabs>
        )
      } else if(this.props.isFetching){
        return <div>Preview is loading</div>
      }else if(this.props.error){
        return <div>Preview errored</div>
      }
    }
     else {
      return <div>No preview available</div>
    }
  }

  render(){
    return (<div className="data-preview-vis">
      <h3>Data Preview</h3>
      {this.renderByState()}
    </div>)
  }
}


function mapStateToProps(state) {
  const previewData= state.previewData;
  const data = previewData.previewData;
  const isFetching = previewData.isFetching;
  const error = previewData.error;
  const url = previewData.url;
  return {
    data, isFetching, error, url
  };
}

const  mapDispatchToProps = (dispatch: Dispatch<*>) => {
  return bindActionCreators({
    fetchPreviewData: fetchPreviewData,
  }, dispatch);
}

export default connect(mapStateToProps, mapDispatchToProps)(DataPreviewVis);
