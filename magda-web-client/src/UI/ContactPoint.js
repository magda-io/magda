import React from "react";
import PropTypes from "prop-types";

import MarkdownViewer from "../UI/MarkdownViewer";
import ToggleButton from "./ToggleButton";
import ga from "../analytics/googleAnalytics";

import "./ContactPoint.css";

class ContactPoint extends React.Component {
    state = { reveal: false };

    onRevealButtonClick = () => {
        ga("send", {
            hitType: "event",
            eventCategory: "User Engagement",
            eventAction: "Dataset Contact Point Reveal",
            eventLabel: this.props.contactPoint
        });

        this.setState({
            reveal: true
        });
    };

    render() {
        return (
            <div className="dataset-contact-point">
                <div className="heading">Contact Point: </div>
                {this.state.reveal ? (
                    <MarkdownViewer markdown={this.props.contactPoint} />
                ) : (
                    <ToggleButton onClick={this.onRevealButtonClick}>
                        <span>Click to reveal</span>
                    </ToggleButton>
                )}
            </div>
        );
    }
}

ContactPoint.propTypes = {
    contactPoint: PropTypes.string
};

ContactPoint.defaultProps = {
    contactPoint: ""
};

export default ContactPoint;
