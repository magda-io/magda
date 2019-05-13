import React from "react";

import "./DeterminateProgressBar.scss";

/**
 * Progress bar that changes its width based on progress passed in props
 */
function DeterminateProgressBar(props) {
    const progress = Math.min(Math.max(props.progress || 0, 0), 100);
    return (
        <div className="determinate-pb-bar">
            <div
                className="determinate-pb-progress"
                style={{
                    width: progress + "%"
                }}
            >
                {props.text || ""}
            </div>
        </div>
    );
}

export default DeterminateProgressBar;
