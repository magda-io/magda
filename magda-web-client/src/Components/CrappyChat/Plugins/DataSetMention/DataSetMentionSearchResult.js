import React from "react";
export default function DataSetMentionEntry(props) {
    const { mention } = props;
    return (
        <button
            className="au-btn"
            onMouseDown={props.onMouseDown}
            onMouseLeave={props.onMouseLeave}
            onMouseUp={props.onMouseUp}
            role={props.role}
            className={props.className}
            style={{
                ...props.style
            }}
        >
            {mention.get("title")}
        </button>
    );
}
