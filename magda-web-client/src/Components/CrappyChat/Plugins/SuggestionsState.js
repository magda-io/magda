import React from "react";
import { fromJS } from "immutable";
import debounce from "lodash.debounce";

export default class SuggestionsState extends React.Component {
    constructor(props) {
        super(props);

        this.state = this.buildStateFromProps(props);

        this.onSearchChangeDebounced = debounce(
            this.onSearchChangeUndebounced,
            200
        );
    }

    UNSAFE_componentWillReceiveProps(props) {
        this.setState(this.buildStateFromProps(props));
    }

    buildStateFromProps(props) {
        return {
            suggestions:
                this.ignoreResponses || !props.suggestions
                    ? []
                    : props.suggestions
        };
    }

    onSearchChange({ value }) {
        this.ignoreResponses = false;
        this.setState({
            searchTerm: value
        });

        this.onSearchChangeDebounced(value);
    }

    onSearchChangeUndebounced(value) {
        this.props.onSearchChange(value);
    }

    resetSuggestions() {
        if (this.state.suggestions.length > 0) {
            // this.setState({ suggestions: [] });
            this.ignoreResponses = true;
        }
    }

    render() {
        const MentionSuggestions = this.props.plugin.MentionSuggestions;

        return (
            <MentionSuggestions
                onSearchChange={this.onSearchChange.bind(this)}
                suggestions={fromJS(this.state.suggestions)}
                entryComponent={this.props.entryComponent}
                onClose={this.resetSuggestions.bind(this)}
                onOpen={() => {
                    if (this.state.searchTerm === "") {
                        this.onSearchChange({ value: "" });
                    }
                }}
            />
        );
    }
}
