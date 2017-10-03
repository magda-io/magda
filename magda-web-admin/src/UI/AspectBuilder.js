import React, { Component } from "react";
import { render } from 'react-dom';
import brace from 'brace';
import AceEditor from 'react-ace';

import 'brace/mode/javascript';
import 'brace/theme/github';

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
          this.setState({editor: editor, code: this.props.data.builderFunctionString})
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
    const result = _result || {data: undefined};
    if(JsonTree){
      return <JsonTree data={result}/>
    }
    return null;
  }


  render() {
    const Editor = this.state.editor;
    return (
      <div>
        <h3>{this.props.data.aspectDefinition.name}</h3>
        <div className='row'>
          <div className='col-sm-6'>
              {Editor && <Editor
                          mode="javascript"
                          theme="github"
                          onChange={this.onChange}
                          name="UNIQUE_ID_OF_DIV"
                          value={this.state.code}
                          editorProps={{$blockScrolling: true}}/>}
                <div>
                  <button className='btn btn-primary' onClick={this.onRunCode}>Run</button>
                  <button className='btn btn-primary'onClick={this.onSaveCode} >Save</button>
              </div>
            </div>
            <div className='col-sm-6'>
              {this.renderResult(this.props.result)}
              </div>
            </div>
      </div>
    )
  }
}
