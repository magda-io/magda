import React from "react";
import RequestFormLogic from "../RequestDataset/RequestFormLogic";
import close from "../../assets/close.svg";
import "./DatasetSuggestForm.css";
import AUbutton from "@gov.au/buttons";

//This is the question/report on a dataset form on the
//individual dataset page
export default class DatasetSuggestForm extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            showSuggest: false,
            formPosted: false
        };
    }

    //toggles "formPosted" state whether or not the form is posted or not
    getFormSubmitState = formPosted => {
        this.setState({ formPosted });
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
        this.props.toggleHeader(!this.state.showSuggest);
    };

    render() {
        const formProps = {
            title: "Ask a question about " + this.props.title,
            smallTitle: true,
            namePlaceHolder: "Irving Washingtonnn",
            emailPlaceHolder: "washington.irving@mail.com",
            textAreaPlaceHolder:
                "Location of all industrial solar plants in Victoria",
            textAreaLabel: "What sort of data are you looking for?"
        };
        const alertProps = {
            successMessage: `Someone from the Australian Digital Transformation
            Agency or the organisation that handles the relevant
            data will get in touch soon. Please note that the
            time taken to action your request may vary depending
            on the nature of the request.`,
            successHeader: "Your request has been sent!",
            failMessage: "Error sending form",
            failHeader: "There was an error sending your form!"
        };
        return (
            <div>
                {/* If the form is posted don't show the text in the below para*/}
                {!this.state.showSuggest ? (
                    <div>
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
                            className="close-button"
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
                        />
                    </div>
                )}
            </div>
        );
    }
}
