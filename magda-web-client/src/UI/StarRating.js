import React from "react";
import PropTypes from "prop-types";
import emptyStarIcon from "../assets/emptyStar.svg";
import "./StarRating.css";
import helpIcon from "../assets/help-24.svg";
import ReactTooltip from "react-tooltip";
import starIcon from "../assets/star.svg";

function StarRating(props) {
    const stars = Array(5)
        .fill(emptyStarIcon)
        .fill(starIcon, 0, props.stars);
    const tooltip =
        "Calculated using the <a href='/page/dataset-quality'>Open Data scale</a>";
    return (
        <span className="star-rating-box">
            {stars.map((icon, i) => (
                <span
                    key={i}
                    className={
                        icon === starIcon ? "full-star-icon" : "empty-star-icon"
                    }
                >
                    <img key={i} src={icon} alt="star rating" />
                </span>
            ))}
            <span className="tooltip">
                <img
                    src={helpIcon}
                    alt="Help Link"
                    data-tip={tooltip}
                    data-place="top"
                    data-html={true}
                />
                <ReactTooltip />
            </span>
        </span>
    );
}

StarRating.propTypes = {
    stars: PropTypes.number
};

StarRating.defaultProps = {
    stars: 0
};

export default StarRating;
