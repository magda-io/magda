import { gapi } from "analytics/ga";
import MarkdownViewer from "Components/Common/MarkdownViewer";
import MagdaNamespacesConsumer from "Components/i18n/MagdaNamespacesConsumer";
import PropTypes from "prop-types";
import React from "react";
import "./ContactPoint.scss";
import ToggleButton from "./ToggleButton";

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
                {(translate) => (
                    <div className="dataset-contact-point">
                        <span className="description-heading">
                            {translate(["contactPointTitle", "Contact Point"])}:
                        </span>
                        {this.props.contactPoint ? (
                            <React.Fragment>
                                <div className="no-print">
                                    {this.state.reveal ? (
                                        <MarkdownViewer
                                            markdown={this.props.contactPoint}
                                        />
                                    ) : (
                                        <ToggleButton
                                            onClick={this.onRevealButtonClick}
                                        >
                                            <span>Click to reveal</span>
                                        </ToggleButton>
                                    )}
                                </div>
                                <div className="print-only">
                                    <MarkdownViewer
                                        markdown={this.props.contactPoint}
                                    />
                                </div>
                            </React.Fragment>
                        ) : (
                            <div className="description-text">
                                This publisher has not provided a contact point.
                                Try visiting the original resource for more
                                information:{" "}
                                <a
                                    href={this.props.landingPage}
                                    target="_blank"
                                >
                                    {this.props.source}
                                </a>
                                <MarkdownViewer>
                                    {this.props.source}
                                </MarkdownViewer>
                            </div>
                        )}
                    </div>
                )}
            </MagdaNamespacesConsumer>
        );
    }
}

ContactPoint.propTypes = {
    contactPoint: PropTypes.string,
    source: PropTypes.string,
    landingPage: PropTypes.string
};

ContactPoint.defaultProps = {
    contactPoint: "",
    source: "",
    landingPage: ""
};

export default ContactPoint;
