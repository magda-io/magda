import React from "react";
import PropTypes from "prop-types";

import MarkdownViewer from "../UI/MarkdownViewer";
import ToggleButton from "./ToggleButton";
import ReactGA from "react-ga";

import "./ContactPoint.css";

class ContactPoint extends React.Component {
    state = { reveal: false };

    onRevealButtonClick = () => {
        ReactGA.event({
            category: "User Engagement",
            action: "Dataset Contact Point Reveal",
            label: this.props.contactPoint
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
