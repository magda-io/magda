import React from "react";

import { config } from "../../../../config";
import DataSetMentionSearchResult from "./DataSetMentionSearchResult";
import SuggestionsState from "../SuggestionsState";

export default class DataSetMentionSuggestions extends React.Component {
    constructor(props) {
        super(props);

        this.state = {
            suggestions: []
        };
    }

    onSearchChange(value) {
        let url: string = config.searchApiUrl + `datasets?query=${value}`;

        this.latestUrl = url;

        return fetch(url)
            .then(response => {
                if (response.status >= 400) {
                    // todo
                }
                return response.json();
            })
            .then((json: DataSearchJson) => {
                if (this.latestUrl === url) {
                    this.setState({
                        suggestions: (json.dataSets || []).map(dataSet => ({
                            ...dataSet,
                            name: dataSet.title,
                            decoratedText: dataSet.title
                        }))
                    });
                }
            });
    }

    render() {
        return (
            <SuggestionsState
                plugin={this.props.plugin}
                onSearchChange={this.onSearchChange.bind(this)}
                suggestions={this.state.suggestions}
                entryComponent={DataSetMentionSearchResult}
            />
        );
    }
}
