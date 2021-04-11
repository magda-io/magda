import React from "react";
import RequestFormLogic from "Components/Dataset/Suggest/RequestFormLogic";
import { ReactComponent as DownArrowIcon } from "assets/downArrow.svg";
import { ReactComponent as UpArrowIcon } from "assets/upArrow.svg";
import { ReactComponent as CloseIcon } from "assets/close.svg";
import "./SearchPageSuggest.scss";

//This is the suggest form on the search results page
export default class SearchPageSuggest extends React.Component {
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

    //toggles "formPosted" state whether or not the form is posted or not
    getFormSubmitState = (formPosted) => {
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
            namePlaceHolder: "Dorothy Hill",
            emailPlaceHolder: "dorothyhill@example.com",
            textAreaPlaceHolder:
                "It helps if you're really specific on the kind of data you're looking for and what you would use it for. Feel free to report any problems you run into as well.",
            textAreaLabel: "What sort of data are you looking for?",
            successHeader: "Your suggestion has been submitted!"
        };
        return (
            <div className="suggest-dataset-div">
                {/* If the form is posted don't show the text in the below para*/}
                {!this.state.formPosted ? (
                    <h3 className="suggest-dataset-text">
                        Can't find what you're looking for?{" "}
                        <button
                            onClick={this.toggleSuggest}
                            className="link-button suggest-dataset-button"
                        >
                            {" "}
                            Suggest a new dataset
                        </button>
                        {this.state.showSuggest ? (
                            <UpArrowIcon
                                className="suggest-dataset-icon"
                                aria-label="close icon"
                                onClick={this.toggleSuggest}
                            />
                        ) : (
                            <DownArrowIcon
                                className="suggest-dataset-icon"
                                aria-label="close icon"
                                onClick={this.toggleSuggest}
                            />
                        )}
                    </h3>
                ) : (
                    <CloseIcon
                        className="correspondence-search-close-button"
                        aria-label="close icon"
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
                        formSubmitState={this.getFormSubmitState}
                        requestType="request"
                        handleChange={this.handleChange}
                        senderEmail={this.state.senderEmail}
                        senderName={this.state.senderName}
                        message={this.state.message}
                    />
                )}
            </div>
        );
    }
}
