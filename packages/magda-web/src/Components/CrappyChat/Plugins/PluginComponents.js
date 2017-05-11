import React from "react";

import UserMentionSuggestions from "./UserMention/UserMentionSuggestions";

export default function PluginComponents(props) {
  return (
    <div>
      <UserMentionSuggestions plugin={props.userMentionsPlugin} />
    </div>
  );
}
