import React from "react";
import PropTypes from "prop-types";

import MarkdownViewer from "../UI/MarkdownViewer";
import MagdaNamespacesConsumer from "../Components/i18n/MagdaNamespacesConsumer";
import ToggleButton from "./ToggleButton";
import { gapi } from "../analytics/ga";

import "./ContactPoint.scss";

class ContactPoint extends React.Component {
    state = { reveal: false };

    onRevealButtonClick = () => {
        gapi.event({
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
            <MagdaNamespacesConsumer ns={["datasetPage"]}>
                {translate => (
                    <div className="dataset-contact-point">
                        <div className="heading">
                            {translate(["contactPointTitle", "Contact Point"])}:
                        </div>
                        {this.state.reveal ? (
                            <MarkdownViewer
                                markdown={this.props.contactPoint}
                            />
                        ) : (
                            <ToggleButton onClick={this.onRevealButtonClick}>
                                <span>Click to reveal</span>
                            </ToggleButton>
                        )}
                    </div>
                )}
            </MagdaNamespacesConsumer>
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
