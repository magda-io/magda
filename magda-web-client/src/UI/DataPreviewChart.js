import 'es6-symbol/implement';
import React, { Component } from 'react';
import Tabs from 'muicss/lib/react/tabs';
import Tab from 'muicss/lib/react/tab';


const VEGAMARK = ['area', 'bar', 'circle', 'line', 'point', 'rect', 'square', 'text', 'tick'];
const DATATYPE = ['quantitative', 'temporal', 'ordinal', 'nominal'];

class DataPreviewChart extends Component {
  constructor(props) {
    super(props);
    this.state = {}
  }

  onChange(i, value, tab, ev) {
    console.log(arguments);
  }

  onActive(tab) {
    console.log(arguments);
  }

  renderChart(){
    
  }

  renderTable(){

  }

  render(){
    return (
      <Tabs onChange={this.onChange} defaultSelectedIndex={1}>
        <Tab value="pane-1" label="Chart" onActive={this.onActive}>{this.renderChart()}</Tab>
        <Tab value="pane-2" label="Table">{this.renderTable()}</Tab>
      </Tabs>
    )
  }
}


export default DataPreviewChart;
