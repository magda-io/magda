import React from "react";

import { Link } from "react-router-dom";

export default function DataSetMentionSearch(props) {
    return (
        <Link
            key={props.mention.get("identifier")}
            className={props.className}
            to={`/dataset/${encodeURIComponent(
                props.mention.get("identifier")
            )}`}
            contentEditable={false}
        >
            #{props.mention.get("title")}
        </Link>
    );
}
