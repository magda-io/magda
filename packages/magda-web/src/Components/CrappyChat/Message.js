import React from "react";
import { EditorState, convertFromRaw } from "draft-js";
import Editor from "draft-js-plugins-editor";
import prettydate from 'pretty-date';

import base from "./Base";
import pluginsFn from "./Plugins/Plugins";
import "./Message.css";

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

  componentWillMount() {
    base.syncState(`users/${this.props.comment.uid}`, {
      context: this,
      state: "user"
    });
  }

  componentWillReceiveProps(props) {
    this.setState({
      editorState: EditorState.push(
        this.state.editorState,
        convertFromRaw(JSON.parse(props.comment.message))
      )
    });
  }

  onEditorChange(newEditorState) {
    this.setState({
      editorState: newEditorState
    });
  }

  render() {
    return (
      <div className="cc-message">
        <img
          className="cc-message__avatar"
          src={this.state.user && this.state.user.photoURL}
        />

        <div className="cc-message__right-of-avatar">
          <strong>{this.state.user && this.state.user.displayName}</strong>{" "}
          <small>{this.props.comment.date && prettydate.format(new Date(this.props.comment.date))}</small>
          <Editor
            onChange={this.onEditorChange.bind(this)}
            readOnly={true}
            editorState={this.state.editorState}
            plugins={Object.values(this.plugins)}
          />
        </div>
      </div>
    );
  }
}
