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
      editor: null
    };
    this.onChange = this.onChange.bind(this);
  }
  onChange(newValue) {
    console.log('change',newValue);
  }

  getEditor(){
      return import('react-ace').then(module => module.default)
    }

  componentWillMount(){
      if(!this.state.editor){
        this.getEditor().then(editor=>{
          this.setState({editor})
        })
      }
  }


  render() {
    const Editor = this.state.editor;
    return (
      <div>
        <h3>{this.props.data.aspectDefinition.name}</h3>
        {Editor && <Editor
                    mode="javascript"
                    theme="github"
                    onChange={this.onChange}
                    name="UNIQUE_ID_OF_DIV"
                    value={this.props.data.builderFunctionString}
                    editorProps={{$blockScrolling: true}}
                    height={'200px'}/>}
          <div>
            <button className='btn btn-primary'>Run</button>
            <button className='btn btn-primary'>Save</button>
          </div>
      </div>
    )
  }
}
