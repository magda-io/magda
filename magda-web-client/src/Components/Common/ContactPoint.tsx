import React from "react";
import MarkdownViewer from "Components/Common/MarkdownViewer";
import MagdaNamespacesConsumer from "Components/i18n/MagdaNamespacesConsumer";
import ToggleButton from "./ToggleButton";
import { sourceAspect } from "../../helpers/record";
import { gapi } from "analytics/ga";

import "./ContactPoint.scss";

type PropsType = {
    contactPoint?: string;
    source?: string;
    landingPage?: string;
    sourceDetails?: sourceAspect;
};

class ContactPoint extends React.Component<PropsType> {
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
        const sourceString = this.props?.sourceDetails?.originalName
            ? this.props.sourceDetails.originalName
            : this.props?.source
            ? this.props.source
            : "";

        return (
            <MagdaNamespacesConsumer ns={["datasetPage"]}>
                {(translate) => (
                    <div className="dataset-contact-point">
                        <div className="description-heading">
                            {translate(["contactPointTitle", "Contact Point"])}:
                        </div>
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
                                    rel="noreferrer"
                                >
                                    {sourceString}
                                </a>
                                <MarkdownViewer>{sourceString}</MarkdownViewer>
                            </div>
                        )}
                    </div>
                )}
            </MagdaNamespacesConsumer>
        );
    }
}

export default ContactPoint;
