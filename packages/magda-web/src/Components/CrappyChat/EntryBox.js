import React from "react";
import Editor from "draft-js-plugins-editor";
import { fromJS } from "immutable";
import {
  EditorState,
  ContentState,
  convertFromRaw,
  convertToRaw
} from "draft-js";
import base from "./Base";

import pluginsFn from "./Plugins";
import Entry from "./AtMentionEntry";

export default class EntryBox extends React.Component {
  constructor(props) {
    super(props);

    this.plugins = pluginsFn();

    this.state = {
      editorState: EditorState.createEmpty(),
      suggestions: fromJS([]),
      users: []
    };
  }

  onEditorChange(newEditorState) {
    this.setState({
      editorState: newEditorState
    });
  }

  resetState() {
    this.setState({
      editorState: EditorState.push(
        this.state.editorState,
        ContentState.createFromText("")
      )
    });
  }

  onSubmit(e) {
    e.preventDefault();

    this.props.onSubmit(
      JSON.stringify(convertToRaw(this.state.editorState.getCurrentContent()))
    );

    this.resetState();
  }

  onSearchChange({ value }) {
    base
      .fetch("users", {
        context: this,
        asArray: true
      })
      .then(users => {
        this.setState({
          suggestions: fromJS(
            users
              .filter(
                user =>
                  user.displayName.toLowerCase().indexOf(value.toLowerCase()) >
                  -1
              )
              .map(user => ({
                ...user,
                name: user.displayName
              }))
          )
        });
      });
  }

  render() {

    return (
      <form onSubmit={this.onSubmit.bind(this)}>
        <Editor
          editorState={this.state.editorState}
          onChange={this.onEditorChange.bind(this)}
          plugins={Object.values(this.plugins)}
        />
        <this.plugins.mention.MentionSuggestions
          onSearchChange={this.onSearchChange.bind(this)}
          suggestions={this.state.suggestions}
          entryComponent={Entry}
        />
        <input type="submit" />
      </form>
    );
  }
}
