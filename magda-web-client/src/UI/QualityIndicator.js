import React from "react";
import { Link } from "react-router-dom";

import StarRating from "./StarRating";
import "./QualityIndicator.css";
import helpIcon from "../assets/help-24.svg";

function QualityIndicator(props) {
    let rating = Math.ceil(parseFloat(props.quality).toFixed(2) * 10 / 2) - 1;

    if (rating < 0) {
        rating = 0;
    }

    return (
        <div>
            <Link to="/page/dataset-quality">Open Data Quality</Link>:
            &nbsp;&nbsp;
            <StarRating stars={rating} />
            <div className="tooltip">
                <img src={helpIcon} alt="Help Link" />
                <span className="tooltiptext">
                    Calculated using the{" "}
                    <Link to="/page/dataset-quality">Open Data scale</Link>
                </span>
            </div>
        </div>
    );
}

export default QualityIndicator;
