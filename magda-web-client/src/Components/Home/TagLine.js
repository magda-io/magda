import React from "react";

const TagLine = (props) => {
    return (
        <div className="homepage-tagline">
            <div className="homepage-tagline-inner">{props.taglineText}</div>
        </div>
    );
};

export default TagLine;
