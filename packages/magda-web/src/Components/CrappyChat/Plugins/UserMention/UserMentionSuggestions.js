import React from "react";

import Entry from "./UserMentionEntry";
import SuggestionsState from "../SuggestionsState";
import base from "../../Base";

export default class UserMentionSuggestions extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      suggestions: []
    };
  }

  onSearchChange(value) {
    base
      .fetch("users", {
        context: this,
        asArray: true
      })
      .then(users => {
        this.setState({
          suggestions: users
            .filter(
              user =>
                user.displayName.toLowerCase().indexOf(value.toLowerCase()) > -1
            )
            .map(user => ({
              ...user,
              name: user.displayName
            }))
        });
      });
  }

  render() {
    return (
      <SuggestionsState
        plugin={this.props.plugin}
        onSearchChange={this.onSearchChange.bind(this)}
        suggestions={this.state.suggestions}
        entryComponent={Entry}
      />
    );
  }
}
