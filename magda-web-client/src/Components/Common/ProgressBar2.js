import React from "react";

function ProgressBar(props) {
    const progress = Math.min(Math.max(props.progress || 0, 0), 100);
    return (
        <div
            style={{
                backgroundColor: "#cccccc"
            }}
        >
            <div
                className="progress"
                style={{
                    width: progress + "%"
                }}
            >
                {props.text || ""}
            </div>
        </div>
    );
}

export default ProgressBar;
