import React from "react";
import PropTypes from "prop-types";
import { ReactComponent as EmptyStarIcon } from "assets/emptyStar.svg";
import { ReactComponent as StarIcon } from "assets/star.svg";
import "./StarRating.scss";

function StarRating(props) {
    const stars = Array(5).fill(EmptyStarIcon).fill(StarIcon, 0, props.stars);
    const ratingText = `${props.stars} out of 5 stars`;
    return (
        <div className="star-rating-box" aria-label={ratingText}>
            {stars.map((Icon, i) => (
                <span
                    key={i}
                    className={
                        Icon === StarIcon ? "full-star-icon" : "empty-star-icon"
                    }
                >
                    <Icon key={i} aria-label="star rating" role="img" />
                </span>
            ))}
        </div>
    );
}

StarRating.propTypes = {
    stars: PropTypes.number
};

StarRating.defaultProps = {
    stars: 0
};

export default StarRating;
