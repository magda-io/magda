import React from 'react';
import { EditorState, convertFromRaw } from 'draft-js';
import Editor from 'draft-js-plugins-editor';
import prettydate from 'pretty-date';

import base from "../../RealtimeData/Base";
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
    base.syncState(`users/${this.props.comment.uid}/displayName`, {
      context: this,
      state: 'userName'
    });
    base.syncState(`users/${this.props.comment.uid}/photoURL`, {
      context: this,
      state: 'userAvatar'
    });
  }

  componentDidMount() {
    // Update the amount of time every minute.
    this.interval = setInterval(() => {
      this.forceUpdate();
    }, 60000);
  }

  componentWillUnmount() {
    clearInterval(this.interval);
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

  filter(value) {
    if (typeof value === "object" && Object.keys(value).length === 0) {
      return;
    } else {
      return value;
    }
  }

  render() {
    return (
      <div className='cc-message'>
        <img
          className="cc-message__avatar"
          src={this.filter(this.state.userAvatar) || ""}
        />

        <div className="cc-message__right-of-avatar">
          <strong>{this.filter(this.state.userName) || "Unknown"}</strong>{" "}
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
