import React from "react";
import RequestFormTemplate from "./RequestFormTemplate";
import Alert from "./Alert";

export default class RequestDataset extends React.Component {
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
        fetch(
            "https://magda-dev.terria.io/api/v0/correspondence/send/dataset/request",
            {
                method: "POST",
                headers: {
                    Accept: "/application/json",
                    "Content-type": "application/json"
                },
                body: JSON.stringify({
                    message,
                    senderEmail,
                    senderName
                })
            }
        ).then(response => {
            if (!response.ok) {
                this.setState(() => {
                    return { successResult: false, posted: true };
                });
            } else {
                this.setState(() => {
                    return { successResult: true, posted: true };
                });
            }
        });
    };

    renderPage() {
        const props = {
            title: "Suggest a Dataset",
            namePlaceHolder: "Irving Washington",
            emailPlaceHolder: "washington.irving@mail.com",
            textAreaPlaceHolder:
                "Location of all industrial solar plants in Victoria",
            textAreaLabel: "What sort of data are you looking for?",
            handleSubmit: this.handleSubmit
        };
        const alertProps = {
            type: this.state.successResult ? "success" : "error",
            message: this.state.successResult
                ? `Someone from the Australian Digital Transformation
            Agency or the organisation that handles the relevant
            data will get in touch soon. Please note that the
            time taken to action your request may vary depending
            on the nature of the request.`
                : "Error sending form",
            header: this.state.successResult
                ? "Your request has been sent!"
                : "There was an error sending your form!"
        };
        if (!this.state.posted) {
            return <RequestFormTemplate {...props} />;
        } else {
            if (this.state.successResult) {
                return (
                    <Alert
                        type={alertProps.type}
                        message={alertProps.message}
                        header={alertProps.header}
                    />
                );
            } else {
                return (
                    <Alert
                        type={alertProps.type}
                        message={alertProps.message}
                        header={alertProps.header}
                    />
                );
            }
        }
    }

    render() {
        return this.renderPage();
    }
}
