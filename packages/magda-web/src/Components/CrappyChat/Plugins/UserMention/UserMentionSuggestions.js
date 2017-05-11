import React from "react";
import Entry from "./UserMentionEntry";
import { fromJS } from "immutable";
import base from '../../Base';

export default class UserMentionSuggestions extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      suggestions: fromJS([])
    };
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
    const MentionSuggestions = this.props.plugin.MentionSuggestions;

    return (
      <MentionSuggestions
        onSearchChange={this.onSearchChange.bind(this)}
        suggestions={this.state.suggestions}
        entryComponent={Entry}
      />
    );
  }
}
