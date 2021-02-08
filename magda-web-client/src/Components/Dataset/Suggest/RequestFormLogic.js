import React from "react";
import RequestFormTemplate from "./RequestFormTemplate";
import Alert from "Components/Common/Alert";
import { config } from "config";
import { gapi } from "analytics/ga";
import MagdaNamespacesConsumer from "Components/i18n/MagdaNamespacesConsumer";

export default class RequestFormLogic extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            successResult: false,
            posted: false,
            isSending: false,
            senderEmail: "",
            message: "",
            senderName: ""
        };
    }

    /**
     * This handles the change event of typing into the form.
     * It passes the state value of email, name and message.
     * When called in the parent component,
     * it also helps retain the state when the form is not submited, or an error state has occured.
     */
    handleChange = (data) => {
        this.props.handleChange(data, this.state.successResult);
    };

    /**
     * handles the logic of submitting form
     * @param {Object} data form submitted data from child component "RequestFormTemplate.js"
     */
    handleSubmit = (data) => {
        this.setState(() => {
            return {
                isSending: true
            };
        });
        const senderEmail = data.senderEmail;
        const message = data.message;
        const senderName = data.senderName;
        var url = "";
        //check to see the type of request. This will change the api url accordingly
        if (this.props.requestType === "request") {
            url = config.correspondenceApiUrl + "send/dataset/request";
        } else {
            url =
                config.correspondenceApiUrl +
                `send/dataset/${encodeURIComponent(
                    this.props.datasetId
                )}/question`;
        }
        fetch(url, {
            ...config.credentialsFetchOptions,
            method: "POST",
            headers: {
                "Content-type": "application/json",
                "Access-Control-Allow-Origin": "*"
            },
            body: JSON.stringify({
                message,
                senderEmail,
                senderName
            })
        })
            .then((response) => {
                if (!response.ok) {
                    this.setState(() => {
                        return {
                            successResult: false,
                            posted: true,
                            isSending: false
                        };
                    });
                    if (this.props.formSubmitState) {
                        this.props.formSubmitState(true);
                    }
                } else {
                    this.setState(() => {
                        return {
                            successResult: true,
                            posted: true,
                            isSending: false
                        };
                    });

                    gapi.event({
                        category: "User Engagement",
                        action:
                            this.props.requestType === "request"
                                ? "Data Request"
                                : "Dataset Feedback",
                        label: this.props.datasetId
                    });

                    this.handleChange(data);
                    if (this.props.formSubmitState) {
                        this.props.formSubmitState(true);
                    }
                }
            })
            .catch((error) => {
                this.setState(() => {
                    return {
                        successResult: false,
                        posted: true,
                        isSending: false
                    };
                });
            });
    };

    /**
     * Render logic of the page.
     * Shows the form or alert dependent on the "posted" state
     * Shows success or fail alert dependent on "successResult" state,
     * which is received from calling API
     */
    render() {
        return (
            <MagdaNamespacesConsumer ns={["datasetSuggestForm"]}>
                {(translate) => {
                    const alertProps = {
                        successMessage: translate([
                            "suggestSuccessMessage",
                            "Your suggestion has been sent to the maintainers of this site."
                        ]),
                        successHeader: this.props.formProps.successHeader,
                        failMessage: null,
                        failHeader:
                            "Uh oh. There was an error sending your form!"
                    };
                    const alert = {
                        type: this.state.successResult ? "success" : "error",
                        message: this.state.successResult
                            ? alertProps.successMessage
                            : alertProps.failMessage,
                        header: this.state.successResult
                            ? alertProps.successHeader
                            : alertProps.failHeader
                    };
                    if (!this.state.posted) {
                        return (
                            <RequestFormTemplate
                                {...this.props.formProps}
                                handleSubmit={this.handleSubmit}
                                isSending={this.state.isSending}
                                handleChange={this.handleChange}
                                senderEmail={this.props.senderEmail}
                                senderName={this.props.senderName}
                                message={this.props.message}
                            />
                        );
                    } else {
                        if (this.state.successResult) {
                            return (
                                <Alert
                                    type={alert.type}
                                    header={alert.header}
                                    message={alert.message}
                                />
                            );
                        } else {
                            return (
                                <div>
                                    {!this.state.isSending && (
                                        <Alert
                                            type={alert.type}
                                            message={alert.message}
                                            header={alert.header}
                                        />
                                    )}
                                    <RequestFormTemplate
                                        {...this.props.formProps}
                                        handleSubmit={this.handleSubmit}
                                        handleChange={this.handleChange}
                                        isSending={this.state.isSending}
                                        senderEmail={this.props.senderEmail}
                                        senderName={this.props.senderName}
                                        message={this.props.message}
                                    />
                                </div>
                            );
                        }
                    }
                }}
            </MagdaNamespacesConsumer>
        );
    }
}
