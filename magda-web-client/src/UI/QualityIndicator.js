import React from "react";
import { Link } from "react-router-dom";

import StarRating from "./StarRating";
import "./QualityIndicator.css";
import helpIcon from "../assets/help-24.svg";
import ReactTooltip from "react-tooltip";

function QualityIndicator(props) {
    let rating = Math.ceil(parseFloat(props.quality).toFixed(2) * 10 / 2);

    if (rating < 0) {
        rating = 0;
    }

    const tooltip = "Calculated using the Open Data scale";

    return (
        <div className="quality-indicator">
            <span className="title">Open Data Quality:&nbsp;</span>
            <StarRating stars={rating} />
            <Link to="/page/dataset-quality" className="tooltip">
                <img
                    src={helpIcon}
                    alt="Help Link"
                    data-tip={tooltip}
                    data-place="top"
                    data-html={false}
                />
                <ReactTooltip />
            </Link>
        </div>
    );
}

export default QualityIndicator;
