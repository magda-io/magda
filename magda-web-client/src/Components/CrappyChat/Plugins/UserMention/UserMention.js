import React from "react";

export default function AtMention(props) {
    return (
        <span
            style={{ background: "rgba(0, 0, 0, 0.2)" }}
            className={props.className}
            onClick={() => alert("Clicked on the Mention!")}
            contentEditable={false}
        >
            @{props.mention.get("displayName")}
        </span>
    );
}
