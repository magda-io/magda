import React from "react";
import { fromJS } from "immutable";

import { config } from "../../../../config";
import DataSetMentionEntry from "./DataSetMentionEntry";

export default class DataSetMentionSuggestions extends React.Component {
  constructor(props) {
    super(props);

    this.state = this.buildStateFromProps(props);
  }

  onComponentWillReceiveProps(props) {
    this.buildStateFromProps(props);
  }

  buildStateFromProps(props) {
    return {
      suggestions: fromJS(props.datasets || [])
    };
  }

  onSearchChange({ value }) {
    let url: string =
      config.searchApiBaseUrl + `search/datasets?query=${value}`;

    return fetch(url)
      .then(response => {
        if (response.status >= 400) {
          // todo
        }
        return response.json();
      })
      .then((json: DataSearchJson) => {
        this.setState({
          suggestions: fromJS(json.dataSets || [])
        });
      });
  }

  render() {
    const MentionSuggestions = this.props.plugin.MentionSuggestions;

    return (
      <MentionSuggestions
        onSearchChange={this.onSearchChange.bind(this)}
        suggestions={this.state.suggestions}
        entryComponent={DataSetMentionEntry}
      />
    );
  }
}
