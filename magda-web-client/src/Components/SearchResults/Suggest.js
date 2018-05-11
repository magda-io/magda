import React from "react";
import RequestFormLogic from "../RequestDataset/RequestFormLogic";
import downArrow from "../../assets/downArrow.svg";
import upArrow from "../../assets/upArrow.svg";
import close from "../../assets/close.svg";
import "./Suggest.css";

export default class Suggest extends React.Component {
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
    toggleSuggest = () => {
        var showSuggest = this.state.showSuggest;
        this.setState(() => {
            return {
                showSuggest: !showSuggest
            };
        });
    };

    render() {
        const formProps = {
            namePlaceHolder: "Irving Washington",
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
            <div className="suggest-dataset-div">
                {/* If the form is posted don't show the text in the below para*/}
                {!this.state.formPosted ? (
                    <p className="suggest-dataset-text">
                        Can't find what you're looking for?{" "}
                        <a onClick={this.toggleSuggest}>
                            {" "}
                            Suggest a new dataset
                        </a>
                        <img
                            alt="close"
                            className="suggest-dataset-icon"
                            src={this.state.showSuggest ? upArrow : downArrow}
                            onClick={this.toggleSuggest}
                        />
                    </p>
                ) : (
                    <img
                        src={close}
                        className="close-button"
                        alt="close"
                        onClick={() => {
                            this.setState(() => {
                                return {
                                    formPosted: false,
                                    showSuggest: false
                                };
                            });
                        }}
                    />
                )}
                {this.state.showSuggest && (
                    <RequestFormLogic
                        formProps={formProps}
                        alertProps={alertProps}
                        formSubmitState={this.getFormSubmitState}
                        requestType="request"
                    />
                )}
            </div>
        );
    }
}
