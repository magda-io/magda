import 'es6-symbol/implement';
import React, { Component } from 'react';
import Tabs from 'muicss/lib/react/tabs';
import Tab from 'muicss/lib/react/tab';
import ChartConfig from './ChartConfig';


const VEGAMARK = ['area', 'bar', 'circle', 'line', 'point', 'rect', 'square', 'text', 'tick'];
const DATATYPE = ['quantitative', 'temporal', 'ordinal', 'nominal'];

class DataPreviewChart extends Component {
  constructor(props) {
    super(props);
    this.state = {
      previewState: 'ready'
    }
  }

  onChange(i, value, tab, ev) {
    console.log(arguments);
  }

  onActive(tab) {
    console.log(arguments);
  }

  renderChart(){
    return (<div className='mui-row'>
              <div className='mui-col-sm-6'>Chart</div>
              <div className='mui-col-sm-6'><ChartConfig/></div>
            </div>)
  }

  renderTable(){

  }

  render(){
    if(this.state.previewState === 'ready'){
      return (
        <Tabs onChange={this.onChange} defaultSelectedIndex={0}>
          <Tab value="pane-1" label="Chart" onActive={this.onActive}>{this.renderChart()}</Tab>
          <Tab value="pane-2" label="Table">{this.renderTable()}</Tab>
        </Tabs>
      )
    } else if(this.state.previewState === 'loading'){
      return <div>Preview is loading</div>
    } else {
      return <div>No preview available</div>
    }
  }
}


export default DataPreviewChart;
