import React, { Component } from "react";
import { render } from 'react-dom';
import brace from 'brace';
import AceEditor from 'react-ace';

import 'brace/mode/javascript';
import 'brace/theme/github';
import './AspectBuilder.css';


export default class AspectBuilder extends Component {
  constructor(props) {
    super(props);
    this.state = {
      editor: null,
      jsonTree: null,
      code: ''
    };
    this.onChange = this.onChange.bind(this);
    this.onRunCode = this.onRunCode.bind(this);
    this.onSaveCode = this.onSaveCode.bind(this);

  }

  getJsonTreeComponent(){
      return import('react-json-tree').then(module => module.default)
  }

  onChange(newValue) {
    this.setState({code: newValue});
  }

  getEditor(){
      return import('react-ace').then(module => module.default)
  }

  componentWillMount(){
      if(!this.state.editor){
        this.getEditor().then(editor=>{
          this.setState({editor: editor, code: this.props.aspectConfig.builderFunctionString})
        })
      }

      if(!this.state.jsonTree){
        this.getJsonTreeComponent().then(jsonTree=>{
          this.setState({jsonTree: jsonTree})
        })
      }
  }

  onRunCode(){
    this.props.createTransformer(this.state.code)
  }

  onSaveCode(){

  }

  renderResult(_result){
    const JsonTree = this.state.jsonTree;
    const result = _result || {};
    if(JsonTree){
      return <JsonTree data={result}/>
    }
    return null;
  }


  render() {
    const Editor = this.state.editor;
    return (
      <div>
        <h3>{this.props.aspectConfig.aspectDefinition.name}</h3>
              {Editor && <Editor
                          mode="javascript"
                          theme="github"
                          onChange={this.onChange}
                          name="UNIQUE_ID_OF_DIV"
                          value={this.state.code}
                          width={'100%'}
                          editorProps={{$blockScrolling: true}}/>}
                <div>
                  <button className='btn btn-primary' onClick={this.onRunCode}>Run</button>
                  <button className='btn btn-primary'onClick={this.onSaveCode} >Save</button>
              </div>
              <div>
                <ul className="nav nav-tabs">
                  <li className="active" data-toggle="tab"><button className='btn btn-reset'>Output</button></li>
                  <li><button className='btn btn-reset'>UI</button></li>
                  <li><button className='btn btn-reset'>Documentation</button></li>
                </ul>
                <div  className="tab-content">
                  <div id="output" className="tab-pane fade in active">{this.renderResult(this.props.result)}</div>
                </div>
          </div>
      </div>
    )
  }
}
