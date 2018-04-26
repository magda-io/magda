import React from "react";
import Tooltip from "./Tooltip";

function QualityIndicator(props) {
    let rating = Math.ceil(parseFloat(props.quality).toFixed(2) * 10 / 2) - 1;

    if (rating < 0) {
        rating = 0;
    }

    const qualities = [
        ["Poor", "#c0392b"],
        ["OK", "#FE7F7F"],
        ["Average", "#9b59b6"],
        ["Good", "#3498db"],
        ["Excellent", "#12C9A0"]
    ];

    function getBarColor(index) {
        return {
            display: "inline-block",
            height: "11px",
            width: "4px",
            marginRight: "2px",
            backgroundColor: qualities[rating][1],
            opacity: rating >= index ? 1 : 0.5
        };
    }

    return (
        <div>
            {" "}
            Open Data Quality: {qualities[rating][0]}{" "}
            <span>
                {qualities.map((q, i) => (
                    <span key={i} style={getBarColor(i)} />
                ))}
            </span>&nbsp;
            <Tooltip/>
        </div>
    );
}

export default QualityIndicator;
