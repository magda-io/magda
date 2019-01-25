import "./QualityIndicator.css";

import React from "react";
import StarRating from "./StarRating";
import DataQualityTooltip from "./DataQualityTooltip";

function QualityIndicator(props) {
    let rating = Math.floor((parseFloat(props.quality).toFixed(2) * 10) / 2);

    if (rating < 0) {
        rating = 0;
    }

    return (
        <div className="quality-indicator">
            <span className="title">Linked Data Rating:&nbsp;</span>
            <StarRating stars={rating} />
            <DataQualityTooltip />
        </div>
    );
}

export default QualityIndicator;
