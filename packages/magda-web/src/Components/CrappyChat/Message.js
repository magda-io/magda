import React from "react";
import { EditorState, convertFromRaw } from "draft-js";
import Editor from "draft-js-plugins-editor";
import pluginsFn from "./Plugins/Plugins";

export default class Message extends React.Component {
  constructor(props) {
    super(props);

    this.plugins = pluginsFn();

    const comment = props.comment;

    this.state = {
      ...comment,
      editorState: EditorState.createWithContent(
        convertFromRaw(JSON.parse(comment.message))
      )
    };
  }

  componentWillReceiveProps(props) {
    const comment = props.comment;

    this.setState({
      ...comment,
      editorState: EditorState.push(
        this.state.editorState,
        convertFromRaw(JSON.parse(comment.message))
      )
    });
  }

  onEditorChange(newEditorState) {
    this.setState({
      editorState: newEditorState
    });
  }

  render() {
    const comment = this.state;

    return (
      <div>
        <strong>{comment.email}:</strong>
        <Editor
          onChange={this.onEditorChange.bind(this)}
          readOnly={true}
          editorState={comment.editorState}
          plugins={Object.values(this.plugins)}
        />
      </div>
    );
  }
}
