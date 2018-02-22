import React from "react";

import "./UserMentionSearchResult.css";

export default function Entry(props) {
    const { mention } = props;
    return (
        <button
            onMouseDown={props.onMouseDown}
            onMouseLeave={props.onMouseLeave}
            onMouseUp={props.onMouseUp}
            role={props.role}
            className={"user-mention-search-result " + props.className}
            style={props.style}
        >
            <img
                className="user-mention-search-result__avatar"
                src={mention.get("photoURL")}
                alt={mention.get("displayName")}
            />
            {mention.get("displayName")}
        </button>
    );
}
