import React from "react";

// import UserMentionSuggestions from './UserMention/UserMentionSuggestions';
import DataSetMentionSuggestions from "./DataSetMention/DataSetMentionSuggestions";

export default function PluginComponents(props) {
    return (
        <div>
            {/*<UserMentionSuggestions plugin={props.userMentionsPlugin} />*/}
            <DataSetMentionSuggestions plugin={props.dataSetMentionsPlugin} />
        </div>
    );
}
