import React from "react";
export default function DataSetMentionEntry(props) {
    const { mention } = props;
    return (
        <button
            onMouseDown={props.onMouseDown}
            onMouseLeave={props.onMouseLeave}
            onMouseUp={props.onMouseUp}
            role={props.role}
            className={props.className || "au-btn"}
            style={{
                ...props.style
            }}
        >
            {mention.get("title")}
        </button>
    );
}
