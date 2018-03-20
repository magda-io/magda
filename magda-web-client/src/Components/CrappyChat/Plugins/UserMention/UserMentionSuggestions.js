import React from "react";

import UserMentionSearchResult from "./UserMentionSearchResult";
import SuggestionsState from "../SuggestionsState";

const builtInUsers = [
    {
        displayName: "Custodian"
    }
];

export default class UserMentionSuggestions extends React.Component {
    constructor(props) {
        super(props);

        this.state = {
            suggestions: []
        };
    }

    onSearchChange(value) {
        value
            .fetch("users", {
                context: this,
                asArray: true
            })
            .then(users => {
                this.setState({
                    suggestions: builtInUsers
                        .concat(users)
                        .filter(
                            user =>
                                user.displayName
                                    .toLowerCase()
                                    .indexOf(value.toLowerCase()) > -1
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
                entryComponent={UserMentionSearchResult}
            />
        );
    }
}
