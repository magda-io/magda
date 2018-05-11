import React from "react";
import RequestFormTemplate from "./RequestFormTemplate";
import Alert from "./Alert";
import { correspondenceApiUrl, correspondenceApiReportUrl } from "../../config";

export default class RequestFormLogic extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            successResult: false,
            posted: false
        };
    }

    /**
     * handles the logic of submitting form
     * I still need the form submission logic to be implemented
     * magda-dev.terria.io/api/v0/correspondence/send/dataset/request
     * @param {Object} data form submitted data from child component "RequestFormTemplate.js"
     */
    handleSubmit = data => {
        const senderEmail = data.senderEmail;
        const message = data.message;
        const senderName = data.senderName;
        var url = "";
        //check to see the type of request. This will change the api url accordingly
        if (this.props.requestType === "request") {
            url = correspondenceApiUrl;
        } else {
            url = correspondenceApiReportUrl.replace(
                ":datasetId",
                this.props.datasetId
            );
        }
        fetch(url, {
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
        }).then(response => {
            if (!response.ok) {
                this.setState(() => {
                    return { successResult: false, posted: true };
                });
                if (this.props.formSubmitState) {
                    this.props.formSubmitState(true);
                }
            } else {
                this.setState(() => {
                    return { successResult: true, posted: true };
                });
                if (this.props.formSubmitState) {
                    this.props.formSubmitState(true);
                }
            }
        });
    };

    /**
     * Render logic of the page.
     * Shows the form or alert dependent on the "posted" state
     * Shows success or fail alert dependent on "successResult" state,
     * which is received from calling API
     */
    renderPage() {
        const alert = {
            type: this.state.successResult ? "success" : "error",
            message: this.state.successResult
                ? this.props.alertProps.successMessage
                : this.props.alertProps.failMessage,
            header: this.state.successResult
                ? this.props.alertProps.successHeader
                : this.props.alertProps.failHeader
        };
        if (!this.state.posted) {
            return (
                <RequestFormTemplate
                    {...this.props.formProps}
                    handleSubmit={this.handleSubmit}
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
                    <Alert
                        type={alert.type}
                        message={alert.message}
                        header={alert.header}
                    />
                );
            }
        }
    }

    render() {
        return this.renderPage();
    }
}
