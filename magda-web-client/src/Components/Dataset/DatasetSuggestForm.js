import React from "react";
import RequestFormLogic from "../RequestDataset/RequestFormLogic";
import close from "../../assets/close.svg";
import "./DatasetSuggestForm.css";
import AUbutton from "../../pancake/react/buttons";

//This is the question/report on a dataset form on the
//individual dataset page
export default class DatasetSuggestForm extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            showSuggest: false,
            formPosted: false,
            message: "",
            senderEmail: "",
            senderName: ""
        };
    }

    //toggles "formPosted" state whether or not the form is posted or not
    getFormSubmitState = formPosted => {
        this.setState({ formPosted });
    };

    /**
     * If the form is posted successfully the form will reset to default values,
     * else the values typed in previously are retained.
     * @data: is the object consisting of email, message and name
     * @isFormPosted: is a boolean to say whether or not the form is posted
     * successfully or not
     */
    handleChange = (data, isFormPosted) => {
        const senderEmail = isFormPosted ? "" : data.senderEmail;
        const message = isFormPosted ? "" : data.message;
        const senderName = isFormPosted ? "" : data.senderName;
        this.setState(() => {
            return {
                senderEmail,
                message,
                senderName
            };
        });
    };

    /**
     * toggles whether or not the suggest a dataset form is displayed or not
     */
    toggleShowForm = () => {
        var showSuggest = this.state.showSuggest;
        this.setState(() => {
            return {
                showSuggest: !showSuggest,
                formPosted: false
            };
        });
        this.props.toggleMargin(!this.state.showSuggest);
    };

    render() {
        const formProps = {
            title: "Ask a question about " + this.props.title,
            smallTitle: true,
            namePlaceHolder: "Dorothy Hill",
            emailPlaceHolder: "dorothyhill@example.com",
            textAreaPlaceHolder:
                "Ask a question or report a problem about this dataset.",
            textAreaLabel: "What would you like to ask about this dataset?"
        };
        const alertProps = {
            successMessage: `Someone from the Australian Digital Transformation
            Agency or the organisation that handles the relevant
            data will get in touch soon. Please note that the
            time taken to action your request may vary depending
            on the nature of the request.`,
            successHeader: "Your request has been sent!",
            failMessage: null,
            failHeader: "Uh oh. There was an error sending your form!"
        };
        return (
            <div>
                {/* If the form is posted don't show the text in the below para*/}
                {!this.state.showSuggest ? (
                    <div className="dataset-correspondence-container">
                        <AUbutton
                            className="ask-question-button"
                            onClick={this.toggleShowForm}
                        >
                            Ask question about this dataset
                        </AUbutton>
                    </div>
                ) : (
                    <div className="ask-dataset-form">
                        <img
                            src={close}
                            className="correspondence-dataset-close-button"
                            alt="close"
                            onClick={this.toggleShowForm}
                        />
                        {/*
                            Since this form is the the report/ask a question on a dataset
                            //I will be passing down the datasetID
                         */}
                        <RequestFormLogic
                            formProps={formProps}
                            alertProps={alertProps}
                            formSubmitState={this.getFormSubmitState}
                            datasetId={this.props.datasetId}
                            requestType="report"
                            handleChange={this.handleChange}
                            senderEmail={this.state.senderEmail}
                            senderName={this.state.senderName}
                            message={this.state.message}
                        />
                    </div>
                )}
            </div>
        );
    }
}
