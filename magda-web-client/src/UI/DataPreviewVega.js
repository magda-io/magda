// @flow
import 'es6-symbol/implement';
import React, { Component } from 'react';
import VegaLite from 'react-vega-lite';


const VEGAMARK = ['area', 'bar', 'circle', 'line', 'point', 'rect', 'square', 'text', 'tick'];
const DATATYPE = ['quantitative', 'temporal', 'ordinal', 'nominal'];

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
      "width": 600,
      "height": 200,
      "description": "",
      "mark": "line",
      "encoding": {
        "x": {"field": this.props.data.meta.chartFields.time[0], "type": "temporal"},
        "y": {"field": this.props.data.meta.chartFields.numeric[0], "type": "quantitative"}
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

  handleConfigChange(spec){
    this.setState({
      spec
    })
  }

  renderConfigForm(){
    const currentSpec = this.state.spec;
    return <div>
            <h3>Configure chart display</h3>
            <form>
              <div>
                <label>
                  Type:
                </label>
                <select value={currentSpec.mark} onChange={(event)=>{currentSpec.mark = event.target.value; this.handleConfigChange(currentSpec)}}>
                  {VEGAMARK.map(m => <option value={m} key={m}> {m} </option>)}</select>
              </div>

              <div>
                <label>
                  X Axis Field:
                </label>
                <select value={currentSpec.encoding.x.field} onChange={(event)=>{currentSpec.encoding.x.field = event.target.value; this.handleConfigChange(currentSpec)}}>
                  {this.props.data.meta.chartFields.time.map(m => <option value={m} key={m}> {m} </option>)}</select>
              </div>

              <div>
                <label>
                  Y Axis Field:
                </label>
                <select value={currentSpec.encoding.y.field} onChange={(event)=>{currentSpec.encoding.y.field = event.target.value; this.handleConfigChange(currentSpec)}}>
                  {this.props.data.meta.chartFields.numeric.map(m => <option value={m} key={m}> {m} </option>)}</select>
              </div>
              <div>
                <label>
                  Y Axis Type:
                </label>
                <select value={currentSpec.encoding.y.type} onChange={(event)=>{currentSpec.encoding.y.type = event.target.value; this.handleConfigChange(currentSpec)}}>
                  {DATATYPE.map(m => <option value={m} key={m}> {m} </option>)}</select>
              </div>

            </form>
            </div>
  }

  renderCharts(){
    return (
      <div className="clearfix">
        <div className='vis row'>
          <div className="col-sm-12 white-box"><VegaLite spec={this.state.spec} data={this.state.data}/></div>
        </div>
      </div>
      )
  }

  render(){
    console.log(this.props)
    return <div className='data-preview-vega'>
            {this.renderCharts()}
            {this.renderConfigForm()}
           </div>
  }
}


export default DataPreviewVega;
