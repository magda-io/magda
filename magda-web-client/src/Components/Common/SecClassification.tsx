import React from "react";
import PropTypes from "prop-types";
import "./SecClassification.scss";

function SecClassification(props) {
    const classification = props.secClass;
    if (!classification) {
        return null;
    }
    return (
        <div className="classication-box">
            <div className="dataset-heading">
                Security Classification: {classification}
            </div>
        </div>
    );
}

SecClassification.propTypes = {
    secClass: PropTypes.oneOf([
        "UNOFFICIAL",
        "OFFICIAL",
        "OFFICIAL:SENSITIVE",
        "PROTECTED",
        "SECRET",
        "TOP SECRET"
    ])
};

SecClassification.defaultProps = {
    secClass: "UNOFFICIAL"
};

export default SecClassification;
