import React from "react";
import StarRating from "./StarRating";
import "./QualityIndicator.css";

function QualityIndicator(props) {
    let rating = Math.ceil(parseFloat(props.quality).toFixed(2) * 10 / 2) - 1;

    if (rating < 0) {
        rating = 0;
    }

    return (
        <span className="quality-indicator-box">
            <span>Quality: &nbsp;&nbsp;</span>
            <StarRating stars={rating}/>
        </span>
    );
}

export default QualityIndicator;
