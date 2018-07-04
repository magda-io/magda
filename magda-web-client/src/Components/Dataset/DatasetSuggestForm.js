import React from "react";
import RequestFormLogic from "../RequestDataset/RequestFormLogic";
import close from "../../assets/close-round.svg";
import "./DatasetSuggestForm.css";
import AUbutton from "../../pancake/react/buttons";
import Modal from "react-modal";

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
        //parameters of the modal pop out
        const customStyles = {
            content: {
                top: "50%",
                left: "50%",
                right: "auto",
                bottom: "auto",
                marginRight: "-35%",
                transform: "translate(-50%, -50%)",
                "background-color": "#4b3081",
                zIndex: "11",
                border: "1px solid rgb(204, 204, 204)",
                padding: "0px"
            }
        };
        const formProps = {
            title: false,
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
            <React.Fragment>
                {/* If the form is posted don't show the text in the below para*/}
                {!this.state.showSuggest && (
                    <div className="dataset-button-container">
                        <AUbutton
                            className="au-btn--secondary ask-question-button"
                            onClick={this.toggleShowForm}
                        >
                            Ask a question about this dataset
                        </AUbutton>
                    </div>
                )}
                <React.Fragment>
                    <Modal
                        isOpen={this.state.showSuggest}
                        style={customStyles}
                        onRequestClose={this.toggleShowForm}
                        ariaHideApp={false}
                    >
                        <div className="row modal-header">
                            <h3 className="suggest-modal-heading">
                                {"Ask a question about this dataset"}
                            </h3>
                            <img
                                src={close}
                                className="correspondence-dataset-close-button"
                                alt="close"
                                onClick={this.toggleShowForm}
                            />
                        </div>
                        <div className="ask-dataset-form ask-dataset-form-responsive">
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
                    </Modal>
                </React.Fragment>
            </React.Fragment>
        );
    }
}
