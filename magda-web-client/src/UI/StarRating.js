import React from "react";
import PropTypes from "prop-types";
import emptyStarIcon from "../assets/emptyStar.svg";
import starIcon from "../assets/star.svg";

function StarRating(props) {
    const stars = Array(5)
        .fill(emptyStarIcon)
        .fill(starIcon, 0, props.stars);
    return (
        <span className="star-rating-box">
            {stars.map((icon, i) => (
                <span key={i}>
                    <img key={i} src={icon} alt="star rating" />
                    &nbsp;
                </span>
            ))}
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
